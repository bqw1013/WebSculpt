# Context

## Precipitation Background (Why This Command Exists)

WebSculpt 命令库原有 GitHub 命令仅 `github/get-trending`（node runtime，Search API 近似榜单，限流 10 req/min）。本批命令统一改为 browser runtime：页面访问不受 REST API 配额限制，控制频率即可。`github/list-commits` 沉淀「查看仓库某分支提交历史」这一高频路径。

## Value Assessment

拿到仓库后常需看其提交历史（作者、时间、SHA、提交说明）。命令返回结构化字段（sha/message/author/author_avatar/authored_at/html_url），可链式定位 commit。实现读取 SSR `react-app.embeddedData`，请求量最少（limit≤35 仅 1 次请求），稳定且不易触发 429/403。

## Page Structure

- URL: `https://github.com/{owner}/{repo}/commits`（缺省分支）或 `/commits/{branch}`。
- 主数据源: `<script type="application/json" data-target="react-app.embeddedData">` → `payload.commitGroups[]`（每页 35 条）→ commit 字段 `oid / url / authoredDate / committedDate / shortMessage / authors[{login, displayName, avatarUrl, path}]`。
- 缺省分支: `payload.repo.defaultBranch`；当前生效分支: `payload.refInfo.name`；分支是否解析到提交: `payload.refInfo.currentOid`（null = 分支不存在）。
- 分页: `a[rel="next"]` href，游标 `?after={oid}+{offset}`（offset 每页 +34/+69...），每页 35 条；`a[rel="prev"]` 用 `?before={oid}+{offset}`。
- 仓库重定向: facebook/react → react/react（301），goto 自动跟随；最终 owner/repo 从 `payload.repo.ownerLogin` / `payload.repo.name` 读取。
- 分支选择器（后备 UI 信息）: `button[aria-label="{branch} branch"]`。

## Environment Dependencies

- 浏览器已开启远程调试（`chrome://inspect/#remote-debugging`）。公开数据，无需登录。
- 访问礼貌规范: 命令内建随机等待（250-600ms）+ 随机滚动 + 随机鼠标移动（best-effort，失败不影响命令）。
- daemon 通过 `connectOverCDP` 独立 attach 用户 Chrome，与 explore 的 playwright attach 相互独立；首次连接可能弹系统确认框，稍候重试。
- 单页调用目标 ≤10s；翻页场景（limit>35）合理略慢。

## Failure Signals

- 仓库不存在 → HTTP 404，title 含 "Page not found"，无 embeddedData script → `NOT_FOUND`。
- 分支不存在 → HTTP 200，embeddedData 存在但 `payload.commitGroups` 空、`payload.refInfo.currentOid` null → `NOT_FOUND`。
- 空仓库（未显式指定 branch）→ currentOid null → `EMPTY_RESULT`。
- embeddedData script 缺失且非 404 → `DRIFT_DETECTED`（页面结构变更）。
- 429/403/CAPTCHA → 观察后降速重试。

## Repair Clues

- 后备提取: DOM `li[data-testid="commit-row-item"]`（`data-commit-link` 属性含完整 SHA；`relative-time[datetime]` 为时间；`img[data-testid="github-avatar"]` alt=author login；`h4 a` 为 message）。
- 若 embeddedData 字段改名，回退到 DOM 行选择器。
- 若分页机制变化（Next 链接消失），检查是否恢复为滚动加载；`deferred_commit_data` 端点只补元数据，非翻页端点。

## Repair Record 2026-08-23 (payload wrapped under route key)

- **症状**: `websculpt github list-commits --repo react/react` 返回 `EMPTY_RESULT`（真实大仓库被误判为无提交）。
- **根因**: GitHub 把 SSR 提交数据在 `payload` 下又包了一层 route key。旧结构 `payload.commitGroups / payload.repo / payload.refInfo` 整体移动到 `payload.commitsRoute`（URL 路径无 ref，含 `/commits` 与 `?after=` 分页页）或 `payload.commitsRefRoute`（路径带显式 ref，如 `/commits/{branch}`，含不存在分支）。两 route key 内部结构一致：`commitGroups / repo / refInfo / currentCommit / filters / metadata / ...`。commit 对象字段（oid/url/authoredDate/shortMessage/authors[]）未变；`a[rel="next"]` 游标分页未变。
- **修复**: `extractPage` 以 `const route = payload.commitsRoute || payload.commitsRefRoute || null` 解析，再读 `route.commitGroups` 等；route 为空返回 `hasEmbeddedData: false` 以触发 `DRIFT_DETECTED`。commit 提取与分页逻辑不变。
- **经验**: 复现命令先看 `payload` 顶层 keys；若顶层出现 `*Route` 包装 key，先定位实际数据挂载点再改 `extractPage`，不要直接改动外层导航/分页逻辑。评估页 `payload.commitsLayoutRoute` 无提交数据，勿用。
