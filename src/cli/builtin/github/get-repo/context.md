# Context

## Precipitation Background (Why This Command Exists)

WebSculpt 的 GitHub 命令族中，`get-trending` 只覆盖 trending 榜单。拿仓库后最基础的需求缺口是完整元数据（stars/forks/clone URL/About/license 等）。本命令（github/get-repo）填补该缺口，并可作为 `list-issues`/`get-issue`/`list-pulls` 等后续命令的链式输入（输出 `full_name`/`html_url`）。

决策：全部用 browser runtime，不依赖 GitHub REST API（匿名 60 req/hr 限流），页面访问不受 API 配额限制。

## Value Assessment

高频复用：任何「拿到一个仓库后要了解它」的场景（评估、监控、文档生成、下游命令输入）。一次调用返回完整元数据 + 可选 README，替代多次手工查看页面。与 API 方案相比不受配额限制，与纯 HTML 方案相比拿到 hydration 字段（language/open_issues/日期）。

## Page Structure

- URL: `https://github.com/{owner}/{repo}`
- SSR JSON: `<script type="application/json" data-target="react-app.embeddedData">`（payload 路径见 evidence.md）
  - `payload.sidebarAbout` — description/website/topics/stargazerCount/watcherCount/forksCount/repo.license/repo.isArchived/ownerLogin/repoName
  - `payload.codeViewLayoutRoute.repo` — defaultBranch/createdAt/ownerAvatar
  - `payload.codeViewRepoRoute.overview.codeButton.local.protocolInfo` — httpUrl/sshUrl
  - `payload.codeViewRepoRoute.overview.overviewFiles[0].richText` — README HTML（DOMParser → innerText）
- Hydration DOM:
  - Language: `h2` 文本 `Languages` → 容器内首个 `span[aria-label]`（`JavaScript: 49.5%`）
  - Open issues: `a[href="/{owner}/{repo}/issues"]` innerText 正则
  - Latest commit 时间: 首个 `relative-time[datetime]`
- 404 页：HTTP 404 + title `Page not found` + 无 embeddedData

## Environment Dependencies

- Chrome/Edge 远程调试开启（WebSculpt daemon connectOverCDP attach），无登录要求；登录态下 `ssh_url` 才有值。
- 访问礼貌规范：导航前随机等待 200-700ms；加载后随机滚动 + 随机鼠标移动 + 随机等待；单次调用目标 ≤10s。并发测试时串行、批次间随机延时、不并发轰击。
- 日期注意：embeddedData `createdAt` 在浏览器内为本地时区偏移（如 `+08:00`），实现统一转 UTC ISO。

## Failure Signals

- 404（仓库不存在）→ NOT_FOUND，先于正常选择器检测。
- 429/403 → NETWORK_ERROR（GitHub 速率限制），需降速重试。
- embeddedData 缺失 → DRIFT_DETECTED（页面结构变更）。
- 页面加载但无任何元数据 → EMPTY_RESULT。
- Languages/relative-time 未出现 → 返回 null（不阻塞）。

## Repair Clues

- 若 embeddedData 路径变化：优先检查 `payload.sidebarAbout` / `codeViewLayoutRoute.repo` 键是否仍在；README 改查 `#readme` 或 `article.markdown-body`。
- 若 Issues 计数正则失效：检查 nav 链接 href 是否为 `/{owner}/{repo}/issues` 的变体（如带 query），改用 `a[href*="/issues"]` + owner/repo 匹配。
- 若 Languages 结构变化：兜底用页面 `Languages` 区块 innerText 首行。
- GitHub UI 改版时以 SSR embeddedData 为主源（比 DOM 稳定），hydration 字段仅作补充。
