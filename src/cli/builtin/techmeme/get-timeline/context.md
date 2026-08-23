# Context

## Precipitation Background (Why This Command Exists)

Techmeme 首页（`/`）是人工/算法策展视图，只展示精选报道；而 River（`/river`）是未经编辑排序的完整时间流，覆盖滚动约 6 天窗口。监控"最近几小时/几天 Techmeme 发了什么"需要 River 而非首页。命令沉淀为 `techmeme/get-timeline`，是族内 `get-feed`（首页策展）之外的完整补充。

## Value Assessment

- 高通用性：任何时刻调用都能拿到当下滚动窗口内全部 Techmeme 报道，倒序逐条列出。
- 复用频率：高 — 监控科技新闻流是高频需求，且此页无任何访问限制。
- 省时：解析日期分组 + 作者/来源拆分 + HTML 实体解码 + 页尾 Sponsor/Featured 排除逻辑，每次都要重写会很浪费。
- 输出可链式衔接：`permalink`（如 `260818p46`）可拼 `https://www.techmeme.com/260818/p46` 交 `techmeme/get-story`。

## Page Structure

唯一来源：`https://www.techmeme.com/river`（静态 HTML，HTTP 200，178KB 量级）。

- 日期分组：`<H2>`，格式 "Month D, YYYY"（如 `August 18, 2026`），页内按时间倒序排列。
- 条目行：`<tr class="ritem">`，紧跟所属日期 H2 之后，每个 `<TABLE>` 内含一组条目。
  - 第一个 `<td>`：时间文本，形如 `1:15 AM &nbsp;&bull;`（12 小时制）。
  - 第二个 `<td>`：`<div class="rshr" pml="260818p46" ...></div><cite>作者 / <a>来源</a>:</cite>&nbsp; <a href="原文">标题</a>`。
  - `cite`：含 ` / ` 时左侧为作者、右侧为来源；无 ` / ` 时仅来源（作者 null）。
  - `pml`：rshr div 属性，形如 `yymmdd + "p" + N`，每条唯一。
- 页尾 `<H2>Sponsor Posts</H2>` / `<H2>Featured Podcasts</H2>` 区块用 `<DIV CLASS="item">`（非 `tr.ritem`），按 `tr.ritem` + 日期正则自然排除。
- 无翻页、无 `page=` 参数、无 JS 渲染，内容全静态。

## Environment Dependencies

- 无登录、无浏览器、无 API key — 匿名 HTTP 直取 200。带标准 Chrome User-Agent。
- 请求 pacing：每次请求前随机 sleep 200-700ms（项目硬性要求；Techmeme 实测 58 请求 0 限速，纯防御性降速）。
- Node runtime：只用全局 `fetch` + Node 内置模块，禁止第三方依赖和 inline import。
- `limit` 为数字参数：先正则 `^\d+$` 校验原始串再 parseInt，禁止 parseInt 截断；越界抛 `INVALID_PARAM`。manifest 已声明 default 50，代码不写 fallback。

## Failure Signals

- 200 页面解析不到任何 `tr.ritem` 行 → 页面结构已变，抛 `DRIFT_DETECTED`。
- `tr.ritem` class 改名 / `<H2>` 日期格式变化 / `cite` 内分隔符变化（如 ` / ` 改其他分隔）→ 提取结果异常，先核对页面再修。
- 标题/来源中的 HTML 实体（`&ldquo;` `&rdquo;` `&amp;` `&mdash;` `&nbsp;`）未解码 → 输出出现原始实体文本。
- HTTP 429/403 → 抛 `RATE_LIMITED`（实测不发生，防御性）；其他非 200 → `API_ERROR` / `NOT_FOUND`；网络失败 → `NETWORK_ERROR`。

## Repair Clues

- 若 `tr.ritem` 选择器失效，抓 `/river` HTML 搜索 `class="ritem"`，核对行 class 是否变化。
- 若日期分组失效，核对 `<H2>` 的日期格式（月份全称 + 日 + 年），检查是否带额外 class/属性。
- 若作者/来源拆分失效，检查 `cite` 内分隔符（当前为 ` / `），并注意无作者条目只有来源。
- 若标题/原文链接失效，检查 `</cite>` 之后是否仍为 `<a href>` 锚点（当前锚点紧跟 `&nbsp;`）。
- 备用入口：Techmeme 首页 `/` 仍有 River 链接；页面结构大变时可回到 explore 流程重新验证。
