# Context

## Precipitation Background

This command was created to provide a reusable way to search a Wikipedia language edition by keyword. It covers the common "locate an article" use case and supports pagination and multiple languages.

## Value Assessment

- High reuse value: searching is a frequent entry point for Wikipedia workflows.
- Public API only: no authentication, low barrier.
- Cheap to run: single HTTP request, ~0.3–0.6s typical latency.

## Page Structure

- Endpoint: `https://{language}.wikipedia.org/w/api.php`
- Fixed query parameters:
  - `action=query`
  - `list=search`
  - `srsearch={query}`
  - `srlimit={limit}`
  - `sroffset={offset}`
  - `format=json`
  - `utf8=1`
- Response path: `query.searchinfo.totalhits`, `query.search[]`.
- Result item fields used: `title`, `pageid`, `snippet`, `timestamp`, `size`, `wordcount`.
- URL construction: `https://{language}.wikipedia.org/wiki/{encoded_title_with_underscores}`.

## Environment Dependencies

- Requires outbound HTTPS access to `{language}.wikipedia.org`.
- In regions where direct access is blocked, set standard proxy-related environment variables; the command will route requests through the egress path.
- A descriptive `User-Agent` header is sent with every request.

## Failure Signals

- `query.searchinfo.totalhits === 0` → `EMPTY_RESULT`.
- `data.error` present → map `missingparam` to `INVALID_PARAM`; other API errors to `NETWORK_ERROR`.
- Non-2xx HTTP status → `NETWORK_ERROR` (or `RATE_LIMITED` for 429).
- Request/parse exceptions → `NETWORK_ERROR`.
- If selectors or API fields disappear, drift is detected via missing fields and results in `NETWORK_ERROR` or malformed output.

## Repair Clues

- If the API endpoint changes, update the `url` construction in `command.js`.
- If result fields change, update the `items` mapper in `command.js`.
- If egress-path handling breaks, verify the `ProxyAgent` subclass against the local egress path environment.
