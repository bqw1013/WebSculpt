# pinterest/list-trends

Fetch trending-keyword rankings from Pinterest's official Trends tool (`https://trends.pinterest.com/`). Returns one of three ranking types as a uniform `Array<{rank, term, ...}>`.

## Description

- **featured** (焦点趋势, default): top trending search terms ranked by Pin-save growth. Each entry carries `rank`, `term`, `growthPct` (month-over-month change, `null` when the row shows no growth) and `categories` (the interest categories the term is trending in, Chinese names in a zh UI). The site exposes only the **top 5** — `limit` above 5 has no effect.
- **shopping** (购物趋势): trending product categories ranked by outbound-click growth. Each entry carries `rank`, `term` (product-category name), `growthPct`. The site serves **2 pages × 10 = 20** entries max.
- **search** (搜索趋势): search-keyword trend table. Each entry carries `rank`, `term`, `weeklyChangePct`, `monthlyChangePct`, `yearlyChangePct`, `volume`. `--sort` picks the tab: `growth` / `seasonal` / `monthly` / `yearly`. Supports up to 100 entries.

All three filters are applied via URL parameters, so the command runs a direct page load per request (fast, low request count). It requires a **logged-in browser session** on the `trends.pinterest.com` subdomain.

## Parameters

| name | required | default | description |
|---|---|---|---|
| `type` | no | `featured` | `featured` (焦点趋势) / `shopping` (购物趋势) / `search` (搜索趋势) |
| `region` | no | `us` | Region code. Countries: `us uk ca de fr it es br mx ar co au my ph th eg tr kr`. Regional groups: `south-europe germanic nordic benelux eastern-europe hispanic-latam latam-caribbean east-europe-med`. |
| `interest` | no | `all` | Interest category filter, **only for `type=featured`**. `all` or one of `animals weddings home-decor architecture health education travel beauty fashion food-drink event-planning art parenting gardening diy-crafts`. |
| `sort` | no | `growth` | Search-trends tab, **only for `type=search`**. `growth` (增长趋势) / `seasonal` (季节性) / `monthly` (最佳每月) / `yearly` (最佳每年). |
| `limit` | no | `20` | Max entries (1-100). Capped by the site at 5 for `featured` and 20 for `shopping`. |

## Return Value

```json
{
  "type": "featured | shopping | search",
  "count": 5,
  "items": [
    { "rank": 1, "term": "Pumpkin Patch Outfits", "growthPct": 400, "categories": ["旅行", "时尚", "事件规划"] },
    { "rank": 2, "term": "Apartment Rooms", "growthPct": 300, "categories": ["家居装潢"] }
  ]
}
```

- featured item: `{rank, term, growthPct, categories}`
- shopping item: `{rank, term, growthPct}`
- search item: `{rank, term, weeklyChangePct, monthlyChangePct, yearlyChangePct, volume}`

For search, the change values are percent numbers derived from the API's decimal ratios (×100, rounded). A capped value of `10001` corresponds to the page's "10,000%+" display.

## Usage

```
websculpt pinterest list-trends
websculpt pinterest list-trends --type featured --region us --interest food-drink
websculpt pinterest list-trends --type shopping --region kr --limit 20
websculpt pinterest list-trends --type search --region us --sort seasonal --limit 50
```

## Common Error Codes

- `AUTH_REQUIRED` — the trends subdomain session is not logged in (profile chip missing).
- `INVALID_PARAM` — unknown `type` / `region` / `interest` / `sort`, or non-integer `limit`.
- `EMPTY_RESULT` — the search-trends API returned an error/unavailable response.
- `DRIFT_DETECTED` — (not currently thrown; kept as the repair target) if a stable selector disappears in a future layout change.
