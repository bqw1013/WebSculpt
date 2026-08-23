# Context

## Precipitation Background (Why This Command Exists)

Stocktwits 标的页（`/symbol/{symbol}`）聚合了一屏高密度情报：实时行情、多空情绪分、社区投票、AI 总结、基本面、财报、相关新闻。这些数据 SSR 独有，streams 公开 API（`api.stocktwits.com/api/2/symbols/{symbol}.json` 返回 404）无法提供。为把这条已验证的匿名抓取路径沉淀为可复用命令，沉淀 `stocktwits/get-symbol-overview`（2026-08-20）。

## Value Assessment

- 通用性强：任何 Stocktwits 标的（美股/加密货）一次调用拿全一屏情报，字段缺省自动容错。
- 复用频率高：市场情绪快照、标的速览场景常被请求，无需每次重新探索 SSR 结构。
- 成本低：单次匿名 GET + JSON 解析，无浏览器、无登录、无签名。

## Page Structure

- 入口 URL：`https://stocktwits.com/symbol/{symbol}`（`{symbol}` 用 `encodeURIComponent` 编码）。
- 数据载体：`<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">...</script>`，正则 `/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/`，`JSON.parse(...).props.pageProps.initialData`。
- 加密货（如 `BTC.X`）：服务端 **308** 重定向到 `/coins/{slug}`（如 `/coins/bitcoin`），必须跟随重定向；最终页 `initialData.symbol` 仍为输入值。
- 关键字段：`price_data`（`combined` 为盘前/盘中/盘后合并实时价；**无 `extended_hours` 字段**）、`initialBullBearVoteData`（`{score, title}` 情绪分+标签）、`initialSentimentCardData`（当前 vs 前一日情绪卡）、`aiContent`（仅加密货非空）、`poll`（**全站每日轮换投票**）、`fundamentals`（snake_case，41 键）、`earningsFacts`（键 `ePS` 而非 `eps`）、`articles`（新闻，`canonical_url` 为空时无 url）、`trendingScore`/`trending`、`watchlistCount`。
- `dehydratedState` 仅含首页 trending 数据，与本命令无关，忽略。`dailySentiment` 恒为 `null`，忽略。

## Environment Dependencies

- 无需登录、无需浏览器、无需 daemon attach。
- 传输：`node:https` 直连（Chrome UA + `Accept: text/html` + `Accept-Language: en-US,en;q=0.9` + `Accept-Encoding: gzip, deflate, br`），自动解压 gzip/deflate/br。**不使用全局 fetch**（改用 `node:https` 直连，已验证稳定）。
- 礼貌限速：每次 HTTP 请求前随机 sleep 200-700ms，含重定向每一跳。
- 限流：429/403 指数退避重试最多 3 次；实测 40+ 连发无触发，但保留兜底。
- 错误处理：HTTP 404 或 `pageProps.initialData` 缺失/`initialData.symbol` 非空字符串 → `NOT_FOUND`；`__NEXT_DATA__` 缺失/解析失败 → `API_ERROR`；连接错误 → `NETWORK_ERROR`。

## Failure Signals

- `HTTP 404` 或 `initialData` 缺失 → 标的不存在（返回 `NOT_FOUND`）。
- `__NEXT_DATA__` 正则无匹配或 `JSON.parse` 抛错 → 页面结构变更（`API_ERROR`，需重新 explore）。
- `429`/`403` → 触发限流（`RATE_LIMITED`）。
- 页面内嵌的挑战检测脚本是正常基线，**不是**验证码/封禁页。
- 响应无 `x-ratelimit`/`retry-after` 头，限流检测只能靠状态码。

## Repair Clues

- 若 `__NEXT_DATA__` 结构变化：重新抓取页面，检查 `props.pageProps` 下的新字段名，更新 `parseInitialData` 与字段映射。
- 若重定向规则变化：`MAX_REDIRECTS` 加大；若 308 目标不再是 `/coins/{slug}`，更新跟随逻辑。
- 若某标的字段缺省：命令已容错为 `null`/空数组，无需修复。
- 备选入口：无 API 替代（`api.stocktwits.com/api/2/symbols/{symbol}.json` 404）；SSR 是唯一来源。
