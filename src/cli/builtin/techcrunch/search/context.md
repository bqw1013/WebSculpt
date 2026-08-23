# Context

## Precipitation Background (Why This Command Exists)

TechCrunch has no keyword-search capability in the WebSculpt command library. Existing commands
cover feeds by category (`get-latest`) but not "find articles matching a keyword". `techcrunch/search`
is the basic retrieval entry point — it fills the gap between browsing a feed and needing a specific
topic. Captured after a full-site explore (assess passed) that verified
the public WordPress REST API path.

## Value Assessment

Keyword search is one of the most common retrieval intents. The public REST API
`/wp-json/wp/v2/posts?search={query}` is stable, unauthenticated, and fast (single request per page),
so the command is cheap to build and maintain. It also pairs with `get-article` (feed cards → full
content) and `get-topic` (narrow a keyword to a company/tag). The ElasticPress-backed relevance
ordering lives on the site UI; the API returns the same posts newest-first, which is a stable,
predictable contract for callers.

## Page Structure

- API base: `https://techcrunch.com/wp-json/wp/v2/`
- Search: `GET /wp-json/wp/v2/posts?search={query}&per_page={n}&page={p}&_fields=id,date,link,title,excerpt,jetpack_featured_media_url,categories`
- Match totals in response headers: `X-WP-Total`, `X-WP-TotalPages`; `X-ElasticPress-Query: true` confirms search is Elasticsearch-backed.
- `per_page` cap 100 (verified: page 1 and page 2 at per_page=100 returned 100 distinct posts each, zero ID overlap → deep pagination is real).
- No-match query → HTTP 200 + empty array `[]` (a legitimate success state, not an error).
- Category name resolution: `GET /wp-json/wp/v2/categories?include={id1,id2,...}&per_page=50&_fields=id,name,slug` — only 25 categories exist site-wide, so the include list is always tiny.
- `_fields` keeps payload small. `_embed=1` was rejected (~1.3 MB per post; unusable for lists).
- On-site search UI `https://techcrunch.com/?s={query}` shows the same corpus but orders by relevance (ElasticPress), which fluctuates between requests; the API orders newest-first (verified via browser attach 2026-08-14).

## Environment Dependencies

- Node runtime, no login, no browser.
- Polite pacing: a random 200–700 ms sleep before each HTTP request; pages are fetched
  serially. The API is public and stable, but the sleep keeps cadence moderate since multiple
  techcrunch commands may run near each other.
- Uses global `fetch` (Node 18+). No third-party dependencies.

## Failure Signals

- Non-2xx from API → `API_ERROR` (with status code); 429/403 → `RATE_LIMITED`.
- Network failure → `NETWORK_ERROR`.
- JSON parse failure → `PARSE_ERROR`.
- Response is HTTP 200 but not a JSON array → `DRIFT_DETECTED` (site structure changed).
- Empty results → `[]` with `partial: true` when `limit` exceeds available results; NOT an error.
- Missing/invalid `query` → `MISSING_PARAM`; invalid `limit` (NaN, <1, >100) → `INVALID_PARAM`
  (validated up front, before any request; no silent clamping).
- ElasticPress can reorder results between requests; for partial results the tail of a large
  `limit` may differ slightly on re-run. This is source behavior, stabilized by fixed per_page=100
  and single-pass pagination.

## Repair Clues

- If `posts` API changes shape: re-verify `_fields` and the response array; fall back to parsing
  the on-site search page `https://techcrunch.com/?s={query}` (article cards live in
  `li.wp-block-post` / `.loop-card__title-link`) as an alternate path.
- If category resolution fails: category names can be omitted (cards still valid) or resolved from
  the `categories` endpoint by id.
- Explore record: full-site verification (assess passed).
