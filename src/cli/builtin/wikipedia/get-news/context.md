# Context

## Precipitation Background (Why This Command Exists)

Wikipedia 各语言版本均维护「新闻动态」门户页（如中文版 `Portal:新聞動態`、英文版 `Portal:Current_events`、日文版 `Portal:最近の出来事`），汇总近期重大事件并链接到对应条目。这些页面是公开、结构化且每日更新的优质背景资料源，适合日报与内容分析场景沉淀为可复用命令。

## Value Assessment

- **复用频率高**：任何需要「今天发生了什么」的场景都可调用。
- **跨语言通用**：同一套 API 与解析框架可覆盖多种语言版本。
- **无认证成本**：公开 MediaWiki API，无需登录或 API Key。

## Page Structure

命令使用 MediaWiki Action API：

```
https://{lang}.wikipedia.org/w/api.php?action=parse&page={news_page}&prop=text&format=json
```

不同语言页面结构不同，command.js 内置多策略解析：

- **zh** (`Portal:新聞動態`)：`<h2>` 日期标题与 `<div class="excerpt-block">` 按索引一一对应，`.excerpt > ul > li` 为新闻条目。
- **en** (`Portal:Current_events`)：单一 `<h2>Topics in the news</h2>`，其后第一个 `<ul>` 的 `<li>` 为新闻条目，无日期分组。
- **ja** (`Portal:最近の出来事`)：`<h3>` 日期标题后紧跟 `<ul>`，`<li>` 为新闻条目。
- **fr** (`Modèle:Accueil_actualité`)：单一 `<h2>Actualités</h2>`，其后 `<ul>` 的 `<li>` 含 `<time datetime="...">` 日期。
- **de** (`Wikipedia:Hauptseite`)：主页面 `<h2>In den Nachrichten</h2>` 后的 `<ul>` 条目（条目通常为文章链接）。
- **es/ru/ko** 等：按 `<h2>` 或 `<h3>` 分节，每节后一个 `<ul>`；日期类标题保留为 `date`，否则省略。

## Environment Dependencies

- 网络：必须能访问 `{lang}.wikipedia.org`，部分网络环境需要合适的出口路径。
- 无登录态、无 Cookie、无验证码。
- 命令内部包含标识调用者的请求头。

## Failure Signals

- 页面结构变化导致提取不到日期标题 / `.excerpt-block` / `Topics in the news`：返回 `EMPTY_RESULT`。
- 新闻门户页被删除或更名：MediaWiki API 返回 `missingtitle` → `NOT_FOUND`。
- 网络不可达：`fetch` 抛错或 HTTP 非 2xx → `NETWORK_ERROR`。
- 返回 HTML 中无 recognizable 新闻条目 → `EMPTY_RESULT`。

## Repair Clues

1. 先检查目标语言的新闻门户页 URL 是否仍然有效。
2. 对比 API 返回的 HTML 片段与当前解析策略，必要时在 `command.js` 中新增策略分支。
3. 若 MediaWiki API 引入限制，可考虑切换为 REST API 或页面 HTML，但当前 Action API 路径稳定且信息量充足。
