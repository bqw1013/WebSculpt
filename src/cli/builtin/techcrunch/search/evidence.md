# Evidence: techcrunch/search

This document records the research and validation evidence for the `techcrunch/search` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows one existing command `techcrunch/get-latest` (user source, node runtime, no browser, no login). No name conflict with `techcrunch/search`.
- Source trace: verified in the explore stage (assess `status: passed`, capture eligible, candidate `techcrunch/search`).
- Contract consulted: the node runtime contract before drafting `command.js`.
- API behavior re-verified with curl on 2026-08-14 (not assumed from plan): pagination overlap, no-result behavior, category name resolution.

## Verified URLs

- https://techcrunch.com/wp-json/wp/v2/posts?search=openai&per_page=3&_fields=id,date,link,title,excerpt,jetpack_featured_media_url,categories
- https://techcrunch.com/wp-json/wp/v2/posts?search=openai&per_page=100&page=1&_fields=id,date,link,title
- https://techcrunch.com/wp-json/wp/v2/posts?search=openai&per_page=100&page=2&_fields=id,date,link,title
- https://techcrunch.com/wp-json/wp/v2/posts?search=zzzzzzqqqqqqxxx&per_page=5&_fields=id,date,link,title
- https://techcrunch.com/wp-json/wp/v2/categories?include=577047203,20429,21587494&per_page=50&_fields=id,name,slug
- https://techcrunch.com/wp-json/wp/v2/posts?search=openai&per_page=1&_embed=1 (probe; rejected for payload size)
- https://techcrunch.com/?s=openai (on-site search UI, browser-verified)

## Structural Evidence

- Endpoint: `GET /wp-json/wp/v2/posts?search={query}` — public WordPress REST API, no auth, no browser required.
- Response header `X-ElasticPress-Query: true` — search is powered by ElasticPress (Elasticsearch).
- `X-WP-Total` gives total matching results (`search=openai` → 3832). `X-WP-TotalPages` = ceil(total / per_page).
- `per_page` cap 100. Pagination works: `page=1` and `page=2` with `per_page=100` returned 100 distinct posts each, zero ID overlap → deep pagination is real, not duplicated.
- No-result query (gibberish) → HTTP 200, empty array `[]`, `X-WP-Total: 0`, `X-WP-TotalPages: 0`.
- Minimal `_fields` for list cards: `id,date,link,title,excerpt,jetpack_featured_media_url,categories`.
  - `title.rendered` (HTML-encoded, e.g. `&#8217;` for apostrophes)
  - `excerpt.rendered` (wrapped in `<p>…</p>`, may contain `&#8230;` ellipsis)
  - `link` = canonical post URL
  - `date` = ISO `YYYY-MM-DDTHH:MM:SS`
  - `jetpack_featured_media_url` = featured image URL (present for most posts; can be null for some)
  - `categories` = numeric category IDs (e.g. `[577047203]`)
- Category name resolution: `GET /wp-json/wp/v2/categories?include={id1,id2,...}&per_page=50&_fields=id,name,slug` returns `name`/`slug` for each id. TechCrunch has only 25 categories total, so the include list is always tiny/bounded. Resolve names from the ID list of returned posts; unknown IDs are simply dropped.
- `_embed=1` was probed and rejected: a single post returns ~1.3 MB (embedding author, all terms, media); unusable for a 100-item list. Use the two-request approach (posts + categories batch) instead.
- On-site search UI `https://techcrunch.com/?s={query}` and API `posts?search={query}` draw from the SAME corpus but order differently (browser-verified 2026-08-14): the on-site box uses ElasticPress relevance ranking (e.g. first result for "openai" is an older Feb 2026 piece), while the REST API returns results in reverse-chronological order (newest first, e.g. first result dated 2026-08-13). Both are valid searches over the same post set; the command uses the API and therefore returns newest-first, which is stable and predictable (relevance order fluctuates between requests per ElasticPress).

## Failure Signals

- `HTTP 200` + non-array body → `DRIFT_DETECTED` (structure changed).
- Non-2xx from API → `API_ERROR` with status code.
- Network failure → `NETWORK_ERROR`.
- Empty search results are a legitimate success state (`[]`, `partial: true` when limit exceeds available results), NOT an error.
- Missing/invalid `query` → `MISSING_PARAM` / `INVALID_PARAM` before any request.
- Invalid `limit` (NaN, <1, >100) → `INVALID_PARAM` before any request (no silent clamping; validation happens up front per design guidelines).
- ElasticPress occasionally reorders results between requests (relevance ranking). For partial results this means the tail of a large limit may differ slightly on re-run — a known source-behavior note, not a command bug. Stabilized by fixed per_page (100) and single-pass pagination.
- Polite pacing: API is public and stable; still, commands add a random 200–700ms sleep before each request and run pages serially to keep cadence moderate (8 commands may hit the same site concurrently).

## Capture Assessment

Captured as `techcrunch/search`: it is the entry point for keyword search on TechCrunch, a basic retrieval capability not covered by existing commands (`get-latest` covers category/latest feeds only). Reuses the verified public WordPress REST API channel (same as `get-latest`) with an added `search` action. Node runtime, no auth, no browser. Output is a flat array of article cards (title, url, date, excerpt, image, categories[]) plus `partial` when the stream is exhausted — matching the approved contract. Proceed to capture.
