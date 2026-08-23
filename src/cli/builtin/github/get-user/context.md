# Context

## Precipitation Background (Why This Command Exists)

WebSculpt 的 GitHub 命令族中已覆盖 trending/repo/issue/pull/commits 等，但**用户/组织的公开资料路径是空白**。`list-repos` 列出仓库，`get-user` 返回资料元数据本身（bio、联系方式、社交账号、精确计数、创建时间）——拿到用户/组织后最基础的需求缺口。

决策：browser runtime，读取渲染后的主页（SSR + hydration）拿身份/联系/社交字段；**精确计数（public_repos/public_gists/followers/following/created_at）页面不暴露**（只显示缩写 `316k`/`1.1k`），唯一来源是 GitHub API（`api.github.com/users/{login}`，CORS 允许，经页面上文 fetch 单次 1 请求，匿名 60/hr）。这与 get-repo「不依赖 REST API」不同，属**一手实测裁决**（页面确实无精确计数），用户已确认「稳定、高效、不被限流」——限流时回退 DOM 缩写值。

## Value Assessment

高频复用：任何「拿到一个用户/组织后要了解它」的场景（评估、监控、联系方式提取、下游命令输入）。一次调用返回完整资料 + 精确计数，替代多次手工查看页面与调用 API。混合实现保证：REST 可用时精确、被限流时仍有 DOM 缩写值兜底，不会因 API 配额导致命令失效。

## Page Structure

- URL: `https://github.com/{login}`（用户与组织共用；org 走 `https://github.com/github` 形态）
- 用户页 DOM（SSR + hydration）：
  - login `.p-nickname.vcard-username`；name `.p-name.vcard-fullname`；avatar `img.avatar-user`
  - bio `.p-note.user-profile-bio`（文本在 `data-bio-text` 属性，SSR 即有；无 bio 时 hidden）
  - vcard 项 `.vcard-details li.vcard-detail`：`itemprop="worksFor"`→company、`homeLocation`→location、`email`→邮箱、`url`→blog、`social`→社交账号（`svg title`=平台名 + `a[rel="nofollow me"]` href=主页 URL）
  - followers/following：文本以 `followers`/`following` 结尾的锚（缩写，如 `316k followers`）
  - Repositories tab 徽标：文本含 `Repositories` 的锚（`Repositories12 (12)` 精确 / `Repositories1.1k (1.1k)` 缩写）
- 组织页 DOM：`header.pagehead.orghead`（type=Organization 判据）、h1 名称、`header.pagehead img.avatar`、描述 `.js-profile-editable-replace .color-fg-muted div`、`[itemprop="location"]`、`[itemprop="url"]` blog、`Repositories557 (557)`
- REST `api.github.com/users/{login}`：200→完整精确字段（type/name/avatar/bio/company/blog/location/email/twitter_username/public_repos/public_gists/followers/following/created_at）；404→Not Found；403/429→限流

## Environment Dependencies

- Chrome/Edge 远程调试开启（daemon connectOverCDP attach），无登录要求；REST fetch 复用浏览器网络环境（走用户代理，CORS 允许）。
- 访问礼貌规范：导航前随机等待 200-700ms；加载后随机滚动 + 随机鼠标移动 + 随机等待；单次调用目标 ≤10s（实测 goto ~2.6s + 1 次 fetch）。并发测试时串行、批次间随机延时、不并发访问。
- 精确计数依赖 API 匿名限流 60/hr（同出口 IP 共享配额）；被限流时命令**不失败**，回退页面缩写值并保留 DOM 字段。

## Failure Signals

- 404（用户/组织不存在）：HTTP 404 或 title `Page not found · GitHub` 或 REST 404 → `NOT_FOUND`，先于正常选择器检测。
- 429/403：页面加载被 GitHub 限流 → `NETWORK_ERROR`（降速重试）；REST 403/429 → 回退 DOM 缩写值（不失败）。
- 结构漂移：`.p-nickname.vcard-username` / `header.pagehead.orghead` 均缺失且 REST 也失败 → `EMPTY_RESULT`。
- 可选字段（bio/company/blog/location/email/socials）为 null/空属正常，不视为失败。
- DOM 计数为缩写（`316k`、`1.1k`），不可当作精确值；大数精确值必须来自 REST。

## Repair Clues

- 若 vcard 选择器失效：检查 GitHub 是否改版用户页结构；兜底用 `[itemprop]` 通用扫描 + 页面正文正则。
- 若 social 项 `svg title` 平台名消失：从 `a[rel="nofollow me"]` 的 href host 推导平台（twitter.com/x.com/mastodon.social/bsky.app/instagram.com）。
- 若 Repositories 徽标结构变化：兜底用 `og:description`（`torvalds has 12 repositories available`）解析，或仅依赖 REST。
- 若 REST 被限流：确认匿名 60/hr 是否耗尽；考虑改用已登录会话或降低调用频率；命令已有 DOM 缩写值兜底。
- GitHub UI 改版时以 REST 为精确计数主源、DOM 为身份/联系/社交主源，两者交叉验证。
