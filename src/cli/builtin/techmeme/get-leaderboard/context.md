# Context

## Precipitation Background (Why This Command Exists)

2026-08-19 探索并沉淀。Techmeme 提供两个免费通用作者榜（Leadership/Presence）各 Top 50，且每个日期有滚动 180 天的历史快照页，适合跟踪活跃科技记者/媒体、对比排名历史变化。命令库此前无任何 techmeme 命令。

## Value Assessment

- 复用频率：中等（排行榜查询、记者/媒体影响力追踪、历史排名对比）。
- 替代成本：手动 curl 静态表 + 解析两种来源单元格格式 + 日期换算，费时易错。
- 信息量：HTML 全量渲染，无需浏览器；无登录、无个性化，browser 不提供额外信息。

## Page Structure

- 当前榜（今日）：`https://www.techmeme.com/lbdocs/table__general__Techmeme_{Leadership|Presence}.html`
  - 片段文件：`<header id="authors">` + `<table>`（作者 50 行）+ `<header id="publications">` + `<table>`（媒体 50 行）。只取作者表。
  - 作者行：`<tr><td>Rank</td><td><a>Author</a></td><td><a>@twitter</a>|&nbsp;</td><td>X.XXX%</td><td>SOURCES</td></tr>`。
- 历史榜：`https://www.techmeme.com/{yymmdd}/lb`（如 `260814`）
  - 服务端内联 4 张表：`<table id="{Board}_authors">` / `_pubs`（Board 为 `Leadership`|`Presence`）。行 11-50 带 `display:none` 但 HTML 完整。
  - `<h3 id="a{Board}_authors">` 是标题，勿与表 id 混淆。
- Sources 单元格两格式（可混合出现于同一行）：
  - 简单：`<a>Bloomberg</a>&nbsp;(#1)` → `{name, rank:1, percentage:null}`
  - 详细：`1.048%:&nbsp;<a>Bloomberg</a>&nbsp;(#1), 0.110%:&nbsp;<a>@handle</a>` → 逐来源 `percentage`，非媒体条目 `rank:null`

## Environment Dependencies

- runtime：node。无需登录、无需浏览器。
- 礼貌限速：Techmeme 实测不限速（58 请求 0 限速），但命令按全局规范每次请求前随机 sleep 200-700ms。
- UA：标准 Chrome UA（实测裸 curl 亦可）。

## Failure Signals

- `/{yymmdd}/lb` 返回 404 → 无快照（未来/超范围）→ `NOT_FOUND`。
- 429 → `RATE_LIMITED`；其他非 200 → `API_ERROR`；fetch 拒绝 → `NETWORK_ERROR`。
- 找不到作者表（表 id / header id 结构变化）→ `DRIFT_DETECTED`。
- 若首页 `/lb` 壳改为全 JS 渲染、静态表 URL 带签名/防盗链参数，命令需切 browser runtime。

## Repair Clues

- 当前榜可改用 `https://www.techmeme.com/lb` 壳内 `load_lb_table('general__Techmeme_...')` 指向的静态表（现直接请求 leaderboard 静态表）。
- 历史页 404 时，可先请求 `https://www.techmeme.com/lb` 确认站点存活，区分网络/结构问题。
- 表格位置漂移时，退化为：按 `<header id="authors">` 与 `<header id="publications">` 之间找第一张 `<table>`（当前榜），或按 `_authors` 结尾的 table id 定位（历史榜）。
