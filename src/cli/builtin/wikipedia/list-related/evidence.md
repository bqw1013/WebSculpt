# Evidence: wikipedia/list-related

This document records the research and validation evidence for the `wikipedia/list-related` command.

## Exploration Path

- Checked the existing WebSculpt command library with `websculpt command list wikipedia`. No `list-related` command existed; `wikipedia/get-article` returns a small `related: string[]` subset but does not support independent `limit` control or a dedicated `{title, url}` output.
- Verified that the MediaWiki Action API `prop=links` endpoint returns stable JSON for both `zh` and `en` language editions.
- Confirmed that `pllimit` accepts up to 500 links in a single request for anonymous callers, matching the command's desired upper bound.
- Decided **not** to implement a browser fallback because the API is public, has no hard quota, and returns fully structured data; a node runtime is sufficient.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php?action=query&prop=links&titles={title}&pllimit={limit}&plnamespace=0&format=json&formatversion=2`
- `https://en.wikipedia.org/w/api.php?action=query&prop=links&titles={title}&pllimit={limit}&plnamespace=0&format=json&formatversion=2`

## Structural Evidence

- Endpoint: `https://{language}.wikipedia.org/w/api.php`
- Request parameters:
  - `action=query`
  - `prop=links`
  - `titles={encoded_title}`
  - `pllimit={limit}` (integer, 1–500)
  - `plnamespace=0` (restrict to main-namespace articles)
  - `format=json&formatversion=2&utf8=1`
- Response shape (formatversion=2):
  - `query.pages` is an array.
  - Each page contains `pageid`, `ns`, `title`, and `links`.
  - Each link object contains `ns` and `title`.
  - Pagination is available via `continue.plcontinue`, but because the command limit is capped at 500 (the API's single-request maximum), internal pagination is unnecessary.
- Missing page signal: page object contains `missing: true`.
- Empty link signal: the `links` key is absent or the array is empty.

## Failure Signals

- `missing: true` in the page object → `NOT_FOUND`.
- HTTP 404/timeout/connection failure → `NETWORK_ERROR`.
- HTTP 429 → `RATE_LIMITED` (with retry/backoff optional).
- Invalid `limit` (non-integer or outside 1–500) → `INVALID_PARAM`.
- Invalid `language` code format → `INVALID_PARAM`.
- Missing or empty `title` → `INVALID_PARAM`.
- API-level error object (`data.error`) → mapped to `INVALID_PARAM` for `missingparam`-like codes, otherwise `NETWORK_ERROR`.

## Capture Assessment

This command should be captured. The API path is fully validated, the response is structured JSON, no login is required, and the command fills a clear gap in the Wikipedia command family by exposing article in-page links as a dedicated, paginated-free list.
