# Context

## Precipitation Background (Why This Command Exists)

WebSculpt 的 GitHub 命令族中，`get-repo` 覆盖仓库详情、`list-issues`（并行制作中）可发现 issue 编号；拿到 issue 后最基础的需求缺口是阅读单条 issue 的正文/作者/labels/评论。本命令（github/get-issue）填补该缺口，与 `get-repo` / `list-issues` 链式衔接。

决策：browser runtime，不依赖 GitHub REST API（匿名 60 req/hr 限流）；页面访问不受 API 配额限制，但应控制访问频率（礼貌节奏）。

## Value Assessment

高频复用：任何「拿到一条 issue 后要了解它的内容与讨论」的场景（跟进 bug、评估 issue 状态、生成文档、作为下游命令输入）。一次调用返回完整 issue 元数据 + 可选评论线程。与 API 方案相比不受配额限制；页面为 React 渲染，必须 hydration 后 DOM 提取。

## Page Structure

- URL: `https://github.com/{owner}/{repo}/issues/{number}`
- SSR `react-app.embeddedData` **不含** issue 数据（payload 键只有 preloaded_records/structured_data/issue_search_type/preloadedSubscriptions）；issue 数据由页面加载时调 GraphQL `IssueViewerViewQuery` 获取并渲染进 DOM。
- Hydration 后 DOM 稳定锚点（`data-testid`，详见 evidence.md）：
  - title `[data-testid=issue-title]`；state `[data-testid=header-state]`；author `[data-testid=issue-body-header-author]`；body `[data-testid=issue-body-viewer] .markdown-body`（注意：issue-body-viewer 容器还含 reaction bar，如「👍 3」，须取 .markdown-body 子元素以排除 UI）
  - created_at `[data-testid=issue-body] relative-time[datetime]`
  - labels `[data-testid=sidebar-labels-section] a`（名称取 `a span.textContent`）
  - milestone `[data-testid=sidebar-milestones-section] a`（剥掉 `No due date`）；assignees `[data-testid=sidebar-assignees-section] a[href^="/"]`
  - closed_at：首个文本含 `closed this` 的 `[data-testid^=timeline-row]` 行内 `relative-time[datetime]`
  - 评论 `.react-issue-comment`：author `[data-testid=avatar-link]`、body `.markdown-body`、created_at `relative-time`、去重键 `[data-testid^=comment-viewer-outer-box]`
  - 时间线下一页 `[data-testid=timeline-crawler-pagination] a[rel=next]`（指向 `?timeline_page=N`）
- **评论加载机制（实测，与最初「滚动懒加载」的假设不同）**：评论区不随滚动懒加载（window.scroll / mouse.wheel / 点 Load-more 按钮均不触发新请求）；时间线用 `?timeline_page=N` URL 分页，页面为**互斥窗口**（page 0=最老15+最新15，page 1=中段），需按评论 ID 去重取全。
- 重定向：`facebook/react` → `react/react`；PR 编号 `/issues/{n}` → `/pull/{n}`（命令判定 NOT_FOUND，指引用 get-pull）。
- 404 页：title `Page not found · GitHub`、无 `issue-body-viewer`、无 embeddedData。

## Environment Dependencies

- Chrome/Edge 远程调试开启（WebSculpt daemon connectOverCDP attach），无登录要求。
- 访问礼貌规范：导航前随机等待 200-700ms；加载后随机滚动 + 随机鼠标移动 + 随机等待；单次调用目标 ≤10s（include_comments 分页合理略慢）。并发测试时串行、批次间随机延时、不并发访问。
- daemon 首次 attach 可能弹 Chrome「允许远程调试」系统确认框，稍候重试；`BROWSER_ATTACH_REQUIRED` 时先确认远程调试已开启。

## Failure Signals

- 404（仓库/issue 不存在）→ NOT_FOUND，先于正常选择器检测。
- 重定向到 `/pull/{n}`（PR 编号）→ NOT_FOUND（说明是 PR，提示用 get-pull）。
- 429/403 → NETWORK_ERROR（GitHub 速率限制），需降速重试。
- `[data-testid=issue-body-viewer]` 未出现 → DRIFT_DETECTED（页面结构变更）。
- 页面加载但 title/body/state 全空 → EMPTY_RESULT。
- 超长时间线：page 0 只含最老+最新窗口；include_comments=true 需分页去重取全；include_comments=false 时 comments_count 为初始页可见数（契约已注明）。
- 超长闭合 issue：closed_at 事件可能在后续分页才可见（include_comments=true 覆盖）。

## Repair Clues

- 若 data-testid 失效：检查 GitHub issue 页是否改版；兜底用语义 class（`bdi.js-issue-title` / `.comment-body` / `.State` 旧 UI）或 `article.markdown-body`。
- 若分页 Next 链接找不到：改为探测 `?timeline_page=1`、`=2` 直到 issue-body 不再渲染，仍按评论 ID 去重。
- 若评论 DOM 结构变化：评论容器 class `react-issue-comment` 或 `IssueCommentViewer-module__IssueCommentLayout__*` 被换时，改查 `[data-testid^=comment-viewer-outer-box]` 的父级。
- 若 labels/milestone/assignees 区缺失：改用 H3 区块标题上溯定位（`Section-module__SectionContainer__*` 含 `sidebar-*-section` testid）。
- GitHub UI 改版时优先用稳定 `data-testid`，必要时降级到语义 class；以 hydration 后 DOM 为准。
