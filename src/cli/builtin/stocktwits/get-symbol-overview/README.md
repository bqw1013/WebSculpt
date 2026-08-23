# stocktwits/get-symbol-overview

获取 Stocktwits 标的页的一屏情报快照：行情（含盘前/盘中合并实时价）、多空情绪分与情绪卡、AI 总结、社区投票、基本面、财报事实、相关新闻。匿名 SSR 抓取，无需登录、无需浏览器。

## Description

该命令抓取 `https://stocktwits.com/symbol/{symbol}` 的 SSR HTML，解析内嵌的 `__NEXT_DATA__` JSON，返回标的的行情、情绪、投票、基本面、财报与新闻。数据为 Stocktwits 页面独有，streams 公开 API 无法提供。

## Parameters

| 参数 | 必填 | 说明 |
|------|------|------|
| `symbol` | 是 | 标的代码，如 `AAPL`、`MSTR`、`BTC.X`。加密货（如 `BTC.X`）服务端 308 重定向到 `/coins/{slug}`，命令自动跟随。大小写不敏感。 |

## Return Value

返回对象（字段缺省时为 `null`/空数组，命令容错不报错）：

- `symbol`：`{symbol, symbolMic, symbolDisplay, title, exchange, region, logoUrl, sector, industry, instrumentClass, watchlistCount, trendingScore, trendStatus}`
- `price`：`{open, high, low, last, previousClose, change, percentChange, volume, currencyCode, currencySymbol, quoteType, timestamp, combined: {isValid, price, change, percentChange, timestamp}}`。`combined` 是盘前/盘中/盘后合并实时价；加密货无 OHLC/volume/prevClose，对应为 `null`。
- `sentiment`：`{score: 0-100, label, card: {messageVol: [], sentiment: []}}`。`label` 为服务端给出的情绪标签（如 "Bullish Sentiment"/"Neutral Sentiment"）。`card` 为当前 vs 前一日两段数据。
- `aiSummary`：`[{type, summary, createdAt}]`，仅加密货页有内容（股票通常为空数组）。
- `poll`：`{id, question, status, totalVotes, sponsored, startsAt, expiresAt, winningChoice, choices: [{title, percent}]}`。注意：这是全站每日轮换投票，非标的专属。
- `fundamentals`：对象或 `null`（键已 camelCase），含市值/PE/EPS/股息/52 周高低/财务等。
- `earningsFacts`：对象或 `null`，`{ePS 归一为 eps, earningsCall, nextEarningsCall, sales, symbol, upcomingLatestData}`。
- `news`：`[{headline, url, summary, source, publishedAt}]`，最多 10 条。Stocktwits 自营文章的 `url` 可能为 `null`（`canonical_url` 为空）。

## Usage

```
websculpt stocktwits get-symbol-overview --symbol AAPL
websculpt stocktwits get-symbol-overview --symbol MSTR
websculpt stocktwits get-symbol-overview --symbol BTC.X
```

## Common Error Codes

- `MISSING_PARAM`：缺少必填参数 `symbol`。
- `INVALID_PARAM`：`symbol` 含非法字符或过长。
- `NOT_FOUND`：`HTTP 404` 或页面无 `initialData.symbol`（标的不存在，如 `BOGUSXYZ`）。
- `RATE_LIMITED`：连续触发 Stocktwits 限流（429/403），重试 3 次后放弃。
- `NETWORK_ERROR`：连接失败/超时/TLS 错误，重试 3 次后放弃。
- `API_ERROR`：`__NEXT_DATA__` 缺失或 JSON 解析失败（页面结构变更，需重新探索）。
