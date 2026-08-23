# techmeme/get-leaderboard

获取 Techmeme 作者影响力榜单（Top 50），支持按日期回看历史快照（滚动 180 天窗口）。

## Description

返回 Techmeme 的作者影响力排行：**leadership** 榜（作者报道成为头条簇主导的占比）或 **presence** 榜（作者出现在任何收录报道中的占比），每榜 50 名。可传 `--date` 查看任意历史日期快照（日期范围内无快照则报 `NOT_FOUND`）。

## Parameters

| name | required | default | 说明 |
|------|----------|---------|------|
| `board` | 否 | `leadership` | 榜单口径枚举：`leadership`=报道主导占比榜 / `presence`=报道出现占比榜 |
| `limit` | 否 | `50` | 返回条数，1-50（每榜作者恰 50 名） |
| `date` | 否 | 当前 | 历史快照日期 `YYYY-MM-DD`（如 `2026-08-14`），缺省返回当前榜 |

## Return Value

`Array<{ rank, author, twitter, percentage, sources }>`（rank 1-50）

- `rank`: number，排名
- `author`: string，作者名（如 `Mark Gurman`）
- `twitter`: string | null，Twitter handle（如 `@markgurman`）；页面未提供时为 `null`
- `percentage`: number，占比数值（解析自 `8.450%` → `8.45`；口径随 `board`）
- `sources`: Array，作者来源构成
  - `name`: string，媒体名（如 `Bloomberg`）；可能含作者个人/社媒条目（如 `@jasonschreier.bsky.social`）
  - `rank`: number | null，该来源在媒体榜的排名；非媒体条目为 `null`
  - `percentage`: number | null，该来源贡献占比；仅多来源行给出，简单格式为 `null`

## Usage

```bash
# 当前 Leadership 榜（默认）
websculpt techmeme get-leaderboard

# 当前 Presence 榜前 10
websculpt techmeme get-leaderboard --board presence --limit 10

# 2026-08-14 的 Leadership 榜
websculpt techmeme get-leaderboard --date 2026-08-14
```

## Common Error Codes

- `INVALID_PARAM` — `board` 不是 leadership/presence；`limit` 非 1-50 整数；`date` 非 `YYYY-MM-DD` 或非真实历法日期
- `NOT_FOUND` — 该日期无榜单快照（未来日期或超出归档范围，服务器返回 404）
- `RATE_LIMITED` — 请求过于频繁（429）
- `API_ERROR` — Techmeme 返回异常状态码
- `NETWORK_ERROR` — 网络/DNS/TLS 连接失败
- `DRIFT_DETECTED` — 页面结构变化，无法解析出作者表格
