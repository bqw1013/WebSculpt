# Context

## Precipitation Background (Why This Command Exists)

用户从 Techmeme 列表类命令（get-feed / get-timeline / search）发现故事后，需要把单个故事簇展开为完整聚合视图（主报道 + 全部相关报道 + 各平台讨论链接）。2026-08-19 explore 验证路径后，经用户确认契约沉淀为命令。

## Value Assessment

- 高频复用：Techmeme 是科技新闻聚合标杆，故事簇详情是订阅/追更的基础操作。
- 免登录免浏览器：全站匿名静态 HTML，node fetch 直取，无访问限制（58 请求 0 限速实测）。
- 信息聚合价值高：一个请求拿到主报道 + 全部相关报道 + 各平台讨论链接，替代多次人工点击。

## Page Structure

- 永久链接页 = 当日快照页 + 锚点定位。`/260818/p29` 返回 08-18 完整快照，目标簇用 `<A NAME="a260818p29">` 锚点定位；旧故事同理。
- 簇容器：`<DIV CLASS="clus">` → 一个或多个别名锚点 → `<DIV CLASS="itc1">` → `<DIV CLASS="itc2" ID="260818p29">`（规范 id）→ `<DIV CLASS="item" ID="0i1">`。
- 主报道 CITE：`<CITE>作者 / <A HREF="来源主页">来源</A>:</CITE>`（作者可选，纯来源如 `Anthropic:` 无作者）。
- 主报道正文：`<DIV CLASS="ii">` 内 `ourh` 锚点（标题 + 原文链接）、`ill` 配图（相对路径需拼 `https://www.techmeme.com` 前缀，可能缺失）、`&mdash;` 后为编辑摘要。
- related（More:）：展开态 `<DIV ID="0p1" STYLE="display:none">` 隐藏 div 的 `More:` 段 `<DIV CLASS="di">`（作者 + 来源 + 来源主页 + 文章标题 + 链接，信息比折叠态全）。
- discussions：折叠态 `<DIV ID="0d1">` 的 `<SPAN CLASS="drhed">X:/LinkedIn:/Bluesky:/Mastodon:/Forums:</SPAN>` + `<span class="bls">` 链接（handle + url）。各簇区块组合不固定，须容忍缺失。
- social_posts：主 span 属性 `twurl`(X) / `mdurl`(Mastodon) / `bsurl`(Bluesky) / `thurl`(Threads)。
- 别名簇：多锚点指向同一 itc2（如 `a260818p25`/`a260818p3`/`a260818p26` → itc2 `260818p25`），请求 `/260818/p3` 时 permalink 须回填规范 id `260818/p25`。
- 无时间戳：页面（含 head meta）无任何故事发布时间，`date` 从 URL `yymmdd` 派生（`260815` → `2026-08-15`）。

## Environment Dependencies

- 无需登录、无需浏览器。匿名静态 HTML。
- 请求 pacing：每次请求前随机 sleep 200-700ms（Techmeme 实测不限速，但统一遵守）。
- User-Agent 用标准 Chrome UA。

## Failure Signals

- HTTP 404 → NOT_FOUND（日期无效或故事 id 不存在）。
- 锚点定位不到 → NOT_FOUND。
- 锚点存在但找不到 itc2 簇 / 簇解析失败 → API_ERROR（页面结构漂移）。
- 429/403 → RATE_LIMITED。

## Repair Clues

- 首页与永久链接页结构一致：若永久链接页结构漂移，可用同日期首页对照解析。
- River 页（`/river`）含时刻时间戳（`12:15 AM` + `<H2>日期</H2>`），如未来需要精确发布时间，可考虑二次请求 River（只覆盖近 5 天）。
- 姊妹站 Mediagazer 交叉引用：`<SPAN CLASS="moreat">`（可忽略）。
