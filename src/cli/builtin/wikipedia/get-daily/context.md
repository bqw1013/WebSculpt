# Context

## Precipitation Background

This command captures the daily featured-content feed from the MediaWiki REST API. It is useful for "daily digest" scenarios where a single call needs to return a bundle of highlighted content: featured article, trending articles, historical events, and daily picture.

## Value Assessment

- High reuse value for daily-report generation and content monitoring.
- One API call returns a complete, structured daily bundle.
- Works across language editions with the same endpoint shape.

## Page Structure

- Primary endpoint: `https://{lang}.wikipedia.org/api/rest_v1/feed/featured/{yyyy}/{mm}/{dd}`
- No query parameters; language is the subdomain, date is in the path.
- Response is JSON with language-dependent top-level fields:
  - `zh`: `tfa`, `mostread`, `onthisday`, `image`
  - `en`: `tfa`, `mostread`, `onthisday`, `image`, plus `news` and `dyk` (intentionally excluded)
  - `ja`: `tfa`, `mostread`, `image`

## Environment Dependencies

- Public MediaWiki REST API; no authentication.
- Network access to `*.wikipedia.org` is required. in restricted networks a suitable egress path is necessary.
- Each request includes an identifying caller header per MediaWiki convention.
- The implementation respects standard proxy-related environment variables when present.

## Failure Signals

- Invalid or future date: API returns HTTP 404 with JSON `type: "not_found"`.
- Invalid language subdomain: DNS/SSL connection failure before HTTP.
- Network unreachability: connection timeout; mapped to `NETWORK_ERROR`.
- Empty but valid response: mapped to `EMPTY_RESULT`.

## Repair Clues

- If the feed endpoint changes or returns unexpected fields, verify the response shape at the primary endpoint for a known date and language.
- If view counts disappear, note that `mostread` data lags by about one day; this is a data-source limitation, not a command bug.
- Browser fallback was evaluated and rejected because homepage `mostread` equivalents do not expose view counts/ranks and selectors are language-specific.
