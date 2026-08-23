# Context

## Precipitation Background (Why This Command Exists)

Substack 命令库已有搜索、趋势、订阅流等命令，但缺少直接获取某个出版物主页文章列表的能力。用户在浏览时常需要查看某个 publication 的最新或热门文章，因此沉淀 `substack/get-publication`。

## Value Assessment

- 复用性高：任何 Substack 出版物都可通过子域名访问，参数简单。
- 节省时间：无需手动打开浏览器、切换 Latest/Top、复制文章链接。
- 输出结构化：可直接用于下游命令（如 `substack/get-post`）的输入。

## Page Structure

- 主页 URL：`https://{publication}.substack.com/`
- Latest URL：`https://{publication}.substack.com/?sort=new`
- Top URL：`https://{publication}.substack.com/?sort=top`
- 稳定 API：`GET /api/v1/homepage_data`
  - `newPosts`：Latest 列表
  - `topPosts`：Top 列表
- 出版物元信息：
  - 名称：`script[type="application/ld+json"]` 中的 `name`
  - 描述：`meta[property="og:description"]`
  - 作者：从 `document.title` 的 `"Name | Author | Substack"` 解析

## Environment Dependencies

- 需要 Chrome 远程调试会话（browser runtime）。
- 无需登录。
- 由于 Cloudflare 防护，命令内不能直接使用 node HTTP；必须在浏览器页面上下文中 `fetch`。

## Failure Signals

- 出版物不存在：页面标题 `Not Found`，API 返回 404。
- 页面结构漂移：API 响应中缺少 `newPosts` / `topPosts`。
- 文章标题 DOM 选择器 `data-testid="post-preview-title"` 消失（仅作为加载完成的辅助判断，不直接用于数据提取）。

## Repair Clues

- 如果 API 字段变化，优先检查 `/api/v1/homepage_data` 的新响应结构。
- 如果 Cloudflare 升级导致浏览器 fetch 失败，可能需要调整 `waitUntil` 策略或增加页面加载等待。
- 出版物元信息解析失败时，可降级为仅返回 `publication.name = params.publication`。
