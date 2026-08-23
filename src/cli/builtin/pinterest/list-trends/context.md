# Context

## Precipitation Background (Why This Command Exists)

Pinterest's official Trends tool (`trends.pinterest.com`) is a primary data source for product research and content planning. The overview page hosts three ranking blocks — 焦点趋势 (featured), 购物趋势 (shopping) and 搜索趋势 (search) — that previously had no WebSculpt command. `pinterest/list-trends` was precipitated from a validated explore session (a prior explore workspace, assess passed) to expose all three rankings through one parameterized command.

## Value Assessment

Trending keywords and product categories are reused frequently for selection/placement decisions. The three types share one output shape (`Array<{rank, term, ...}>`) and are fully parameterizable (type/region/interest/sort/limit), so one command replaces three manual scraping flows. Each invocation is a direct page load + extraction (or a single in-page API call for search), keeping runtime low (target ≤10s on defaults).

## Page Structure

- Overview: `https://trends.pinterest.com/` (featured module `[data-test-id="trends-module-card-top-topics"]`, item `[data-test-id="topic-card"]`).
- Shopping: `https://trends.pinterest.com/shopping?country=US` — real `<table>` inside `[data-test-id="shopping-trends-product-categories-table"]`; each data `tr` (has `h3`) has 5 `<td>`: [rank, category name, sparkline, growth, volume]; growth cell `[data-test-id="OUTBOUND_CLICK-growth-summary"]`. Pagination via `?page=2`, next button `[data-test-id="next-table-page-button"]` (aria-disabled on last page). 2 pages × 10 rows = 20 max.
- Search: `https://trends.pinterest.com/search?country=US&trendsPreset=<P>`. Data comes from `GET /top_trends_filtered/?lookbackWindow={W}&endDate={latest}&country={C}&trendsPreset={P}&numTermsToReturn={limit}` where `latest` is from `GET /latest_available_date/`. Both are plain GETs callable with in-page `fetch` (credentials include). Response `values[]`: `term`, `searchCount`, `normalizedCount`, `wow_change.value`, `mom_change.value`, `yoy_change.value` (decimal ratios ×100 → percent; cap 100.01 = "10,000%+"), `seasonality_score`, `reverseRank`.
- Filters are URL params (SPA state), no dropdown interaction needed: `country`, `topicInterestIds`, `trendsPreset`.
- Login proxy selector: `[data-test-id="header-profile"]` (profile chip present when authenticated).

## Environment Dependencies

- Browser runtime; must attach to the user's Chrome (CDP). Login on `trends.pinterest.com` is required (subdomain session is separate from www).
- Polite pacing discipline: random short waits ~200-500ms between interactions (`randWait`), no fixed 1-2s sleeps; retry once with a longer wait on API errors; keeps request count minimal (featured: 1 load; shopping: ≤2 loads; search: 1 load + 2 fetches).
- Execution target ≤10s on default parameters.

## Failure Signals

- `AUTH_REQUIRED`: `[data-test-id="header-profile"]` missing after load → not logged in.
- Empty modules: region with no data (e.g. `?country=KR`) hides featured/moments/shopping modules → returns `{items: [], count: 0}`. Invalid region (`?country=XX`) also yields empty featured.
- Search API failure: non-200 from `/latest_available_date/` or `/top_trends_filtered/` → `EMPTY_RESULT`.
- Drift: if `topic-card` / `shopping-trends-product-categories-table` / `OUTBOUND_CLICK-growth-summary` / `top_trends_filtered` disappear or change, extraction silently returns fewer rows; repair should re-verify selectors.
- Growth text is localized: "较上月增长 X%" (zh UI). In an English UI the regex `较上月增长` would not match → growthPct becomes null; repair should handle both locales.

## Repair Clues

- Backup for search: the page's DOM table (`[data-test-id="filterable-top-trends-table"]`, `[data-test-id="trends-table-term"]`) contains the same data as display strings if the API endpoint changes.
- Backup for featured/shopping: the resource-wrapped API (`/resource/ApiResource/get/` → `/ads/v4/trends/topics/featured/<COUNTRY>/SAVE` and `/ads/v4/trends/shopping/product_categories/top/<COUNTRY>`) returns the same data as JSON but returns 403 for out-of-app fetch; only usable via response interception.
- Enum sources: the region/interest dropdowns (`<select>` under `[data-test-id="地区-filter"]` / `[data-test-id="兴趣-filter"]`) define the canonical value sets; sort tabs are `<a data-test-id="trend-type-switcher">` with `id="trend-type-switcher-<中文名>"`.
