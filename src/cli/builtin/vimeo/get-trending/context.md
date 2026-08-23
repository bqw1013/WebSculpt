# Context

## Precipitation Background (Why This Command Exists)

"现在 Vimeo 什么最火"是高频内容发现需求。`vimeo/search` 只覆盖搜索；plan 文档规划了 `vimeo/get-trending` 作为"算法热度"信号，与 `get-channel`（编辑精选）互补。探索阶段（an explore workspace，assess 已通过）实测推翻了 plan 的 browser 设想：trending 区块内容不在 /watch 的 SSR HTML 中，而是由 JWT 保护的 API `api.vimeo.com/curation_components/2/videos` 懒加载提供。node 直连该 API 即可取到完整字段，因此本命令沉淀为 node runtime。

## Value Assessment

- 复用价值：trending 是通用发现查询，公开免登录，一次运行几秒内返回 1-100 条。可与 `vimeo/get-video` 组合（拿 trending URL 再取详情/评论/字幕）。
- 信息量：API 返回字段 ⊇ 浏览器 DOM 卡片（API 多了 createdAt、badge）。
- 与 search 的一致性：输出信封（total/resultCount/pagesFetched/results/source/partial）对齐 vimeo/search 风格。

## Page Structure

- 数据源：`GET https://api.vimeo.com/curation_components/2/videos?sizes=640&per_page={n}&page={m}&fields={...}`，响应 `{ total, page, per_page, paging:{next}, data:[{uri,name,link,duration,created_time,pictures.sizes[],stats.plays,user:{name,link},badge}] }`。total=2000，per_page 最大 100。
- JWT 来源：`GET https://vimeo.com/watch` 的 SSR HTML，`<script id="viewer-bootstrap">` JSON 的 `jwt` 字段（正则 `"jwt":"([^"]+)"`）。TTL 约 6 分钟。
- 浏览器端懒加载佐证（探索阶段用 Playwright 核实）：页面滚动容器 `div.css-q9qn58`，滚动后触发 `curation_components/2/videos?per_page=12&page=1/2`；DOM 卡片链接带 `?fl=wc`（仅 UI 追踪参数，API `link` 字段干净）。
- `/watch/trending` 301 回 `/watch`，无独立页面。

## Environment Dependencies

- 免登录、免浏览器。仅需能访问 vimeo.com 与 api.vimeo.com。
- 限速/礼貌 pacing：每次网络请求前随机 sleep 200-700ms（已内置）。
- 稳定性：30 次实测调用全 200，无 429/403/Cloudflare。JWT 短时效（6 分钟），命令每次运行开头现取，翻页够用；401 时重取重试。

## Failure Signals

- `/watch` 返回非 200 → `HTTP_ERROR`。
- `/watch` HTML 找不到 `"jwt":"..."` → `DRIFT_DETECTED`（Vimeo 改了 SSR 结构）。
- API 返回 401 → `JWT_EXPIRED`（先重取 token 重试当前页）。
- API 响应缺 `data` 数组 → `DRIFT_DETECTED`（字段参数集变了）。
- API 一页都不给 → `EMPTY_RESULT`。
- 若未来 total 降到 limit 以下，输出会出现 `partial=true`，属正常降级。

## Repair Clues

- JWT 提取正则失效时，回退方案：解析 `<script id="viewer-bootstrap" type="application/json">` 的 JSON 后取 `viewerBootstrap.jwt` 路径，而不仅靠正则。
- API 端点失效时，回退：改从 `/watch` DOM 的 "See what's trending" 区块（H2 文本匹配）解析卡片，链接需剥离 `?fl=wc`；但那需要 browser runtime，且区块懒加载依赖滚动。
- `fields` 参数集若导致 400，可去掉字段子集（不传 fields 返回全量字段，再在 toResult 中映射）。
