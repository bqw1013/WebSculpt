# Evidence: pinterest/list-trends

This document records the research and validation evidence for the `pinterest/list-trends` command.

## Exploration Path

- Command library check: `websculpt command list pinterest` shows only existing command `pinterest/search`. No `list-trends` command exists, so this is a new command.
- A prior explore workspace was created and `websculpt explore assess pinterest-list-trends` returned `status: passed`.
- Browser automation followed the explore protocol; browser automation guide read before explore. Attached to the user's Chrome via CDP.
- Login state on the independent subdomain `trends.pinterest.com` was verified.

## Verified URLs

- `https://trends.pinterest.com/` — overview page; featured module (`焦点趋势`) extracted here. With `?country=US` default region.
- `https://trends.pinterest.com/?country=KR` — region without featured/shopping data: modules hidden.
- `https://trends.pinterest.com/?country=XX` — invalid region: featured module empty.
- `https://trends.pinterest.com/shopping/?country=US` — shopping table full page; pagination via `?page=2`.
- `https://trends.pinterest.com/search/?country=US&trendsPreset=1|2|3|4` — search trends page; sort tabs map to `trendsPreset`.
- `https://trends.pinterest.com/latest_available_date/` — returns `{"date":"2026-08-14"}` (latest data date).
- `https://trends.pinterest.com/top_trends_filtered/` — search-trends data API; plain GET callable via in-page fetch (HTTP 200).
- `https://trends.pinterest.com/resource/ApiResource/get/` — resource-wrapped API for featured/shopping data; returns 403 when fetched outside the app internals, so DOM extraction is used instead.

## Structural Evidence

### Region / Interest / Sort filter mechanism
All three filters are URL parameters driven by SPA state; the command can `goto` the target URL directly (no dropdown interaction required):
- Region → `?country=<CODE>`
- Interest (featured only) → `?topicInterestIds=<VALUE>` (numeric Pinterest category id; `ALL` for all)
- Search sort → `?trendsPreset=<P>` (1=monthly, 2=yearly, 3=growth, 4=seasonal)
- Shopping pagination → `?page=2` (2 pages total, 10 rows each)

### featured (焦点趋势) — DOM extraction
- Container: `[data-test-id="trends-module-card-top-topics"]`
- Items: `[data-test-id="topic-card"]`, max 5 (the site shows only the top 5; no full-list route — `/topics` is 404).
- Per item fields:
  - rank: `h5` innerText
  - term: title text (the text line after the rank in the card)
  - growthPct: regex `较上月增长 ([0-9,]+)%` on card innerText, strip commas; `null` when absent (e.g. negative-growth rows render no growth text)
  - categories: `[data-test-id^="interest-name-"]` innerText (Chinese category names)
- Verified sample (`?country=US`, interest=all):
  - rank1 "Pumpkin Patch Outfits" growth 400, cats [旅行, 时尚, 事件规划]
  - rank2 "Apartment Rooms" growth 300, cats [家居装潢]
  - rank5 "Easy Side Salads and Crowd-Pleasing Salad Recipes" growth null, cats [食品和饮料饮食]

### shopping (购物趋势) — DOM extraction
- URL: `/shopping?country=<CODE>`
- Table: `[data-test-id="shopping-trends-product-categories-table"]`, contains a real `<table>`; each data row (`tr` containing `h3`) has 5 `<td>`: [rank, product-category name (h3), trend sparkline, growth, volume].
- Growth cell: row-scoped `[data-test-id="OUTBOUND_CLICK-growth-summary"]` text `较上月增长 X%` → parse X.
- Pagination: 10 rows/page, 2 pages total (ranks 1-20). Next button `[data-test-id="next-table-page-button"]`, URL becomes `?page=2`. `aria-disabled=true` on last page.
- Verified sample (`?country=US`): rank1 睫毛膏 growth 160; rank2 季节性和节日装饰 growth 84; ... rank10 鞋配件 growth 36; page2 rank11 头巾 growth 33 ... rank20 饼干模具 growth 21.

### search (搜索趋势) — API extraction
- Data API (plain GET, callable from in-page `fetch`):
  `GET /top_trends_filtered/?lookbackWindow={W}&endDate={latest}&country={CODE}&trendsPreset={P}&numTermsToReturn={limit}`
- `latest` from `GET /latest_available_date/` → `{"date":"..."}`.
- Response: `{ values: Array<{ term, searchCount, normalizedCount, seasonality_score, wow_change:{value}, mom_change:{value}, yoy_change:{value}, reverseRank }>, endDate }`.
  - change values are decimal ratios; ×100 → percent. Upper cap 100.01 renders as "10,000%+".
  - rank = array index + 1.
- `numTermsToReturn=100` verified to return exactly 100 terms.
- Verified sample (`?country=US`, preset=3 growth):
  - rank1 "sterling point tv show" weekly 700, monthly 10001, yearly 10001
  - rank2 "sterling point" weekly 1000, monthly 10001, yearly 10001
  - rank4 "end of august nails" weekly 2000, monthly 10001, yearly 40

### sort preset lookup (search only)
| command value | trendsPreset | lookbackWindow |
|---|---|---|
| growth | 3 | 3 |
| seasonal | 4 | 2 |
| monthly | 1 | 2 |
| yearly | 2 | 5 |

### Region enum (26) — verified from the region `<select>` options
`us`=US, `uk`=GB+IE, `ca`=CA, `de`=DE, `fr`=FR, `it`=IT, `es`=ES, `br`=BR, `mx`=MX, `ar`=AR, `co`=CO, `au`=AU+NZ, `my`=MY, `ph`=PH, `th`=TH, `eg`=EG, `tr`=TR, `kr`=KR, `south-europe`=IT+ES+PT+GR+MT, `germanic`=DE+AT+CH, `nordic`=SE+DK+FI+NO, `benelux`=NL+BE+LU, `eastern-europe`=PL+RO+HU+SK+CZ, `hispanic-latam`=MX+AR+CO+CL, `latam-caribbean`=CR+DO+EC+GT+PE, `east-europe-med`=CY+CZ+GR+HU+MT+PL+RO+SK.

### Interest enum (16) — verified from the interest `<select>` options (featured only)
`all`=ALL, `animals`=925056443165, `weddings`=903260720461, `home-decor`=935249274030, `architecture`=918105274631, `health`=898620064290, `education`=922134410098, `travel`=908182459161, `beauty`=935541271955, `fashion`=FASHION, `food-drink`=918530398158, `event-planning`=941870572865, `art`=961238559656, `parenting`=920236059316, `gardening`=909983286710, `diy-crafts`=934876475639.

## Failure Signals

- Resource-wrapped API (`/resource/ApiResource/get/`) returns HTTP 403 "Invalid Resource Request" for out-of-app `fetch` — do not rely on it; use DOM for featured/shopping.
- Region with no data (e.g. `?country=KR`) hides featured/moments/shopping modules entirely → featured/shopping yield empty arrays; the command should return `{ items: [], count: 0 }` rather than throw.
- Invalid region (`?country=XX`) also leaves featured empty.
- featured is capped at 5 rows by the site; `--limit` above 5 has no effect for featured.
- shopping total capped at 20 rows (2 pages); `--limit` above 20 has no effect.
- `topic-card`, `trends-module-card-top-topics`, `shopping-trends-product-categories-table`, `OUTBOUND_CLICK-growth-summary`, `top_trends_filtered` are the key stability anchors; if any disappears, throw `DRIFT_DETECTED`.
- Logged-in state on `trends.pinterest.com` is required (subdomain login is separate from www). If not logged in, page may show login wall → throw `AUTH_REQUIRED` when the module selectors are absent.
- Polite pacing: keep request frequency low; random short waits ~200-500ms between interactions; lengthen on throttling signals.

## Capture Assessment

This command should be captured because Pinterest's official Trends tool is a valuable, stable data source for product research / content planning. The three ranking types (featured/shopping/search) share a uniform output shape (`Array<{rank, term, ...}>`) and are parameterizable (type/region/interest/sort/limit), and the path is fully verified in explore (assess passed). Browser runtime is required for the logged-in subdomain session.
