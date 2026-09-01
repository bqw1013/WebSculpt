# Evidence: wikipedia/get-daily

This document records the research and validation evidence for the `wikipedia/get-daily` command.

## Exploration Path

- Checked the WebSculpt command library: no existing Wikipedia commands.
- Verified the MediaWiki REST aggregated feed endpoint through an indirect egress path.
- Read `references/access/playwright-cli-guide.md` and attached a local browser session via `@playwright/cli` to evaluate browser fallback for API failure scenarios.
- Browser fallback was evaluated and rejected: homepage selectors are language-specific, and the `mostread` view counts/ranks are not available on any homepage (zh has trending titles only; en/ja have no equivalent section).

## Verified URLs

- `https://zh.wikipedia.org/api/rest_v1/feed/featured/2026/08/30`
- `https://en.wikipedia.org/api/rest_v1/feed/featured/2026/08/30`
- `https://ja.wikipedia.org/api/rest_v1/feed/featured/2026/08/30`
- `https://zh.wikipedia.org/api/rest_v1/feed/featured/2024/01/01`
- `https://en.wikipedia.org/api/rest_v1/feed/featured/2024/01/01`
- `https://zh.wikipedia.org/api/rest_v1/feed/featured/9999/99/99` (404 invalid date)
- `https://zh.wikipedia.org/api/rest_v1/feed/featured/2030/01/01` (404 future date)
- `https://xx.wikipedia.org/api/rest_v1/feed/featured/2026/08/30` (DNS/SSL failure)
- `https://zh.wikipedia.org/wiki/Wikipedia:首页`
- `https://en.wikipedia.org/wiki/Main_Page`
- `https://ja.wikipedia.org/wiki/メインページ`

## Structural Evidence

### API endpoint

```text
GET https://{lang}.wikipedia.org/api/rest_v1/feed/featured/{yyyy}/{mm}/{dd}
```

- No query parameters; language is the subdomain, date is in the path.
- Response `Content-Type`: `application/json; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/aggregated-feed/0.5.0"`.

### Top-level fields by language

| Language | Fields |
|---|---|
| `zh` | `tfa`, `mostread`, `onthisday`, `image` |
| `en` | `tfa`, `mostread`, `onthisday`, `image`, `news`, `dyk` |
| `ja` | `tfa`, `mostread`, `image` |

### Field shapes

- `tfa`: `{ title, pageid, description, extract, thumbnail, originalimage, content_urls, ... }`
- `mostread`: `{ date, articles: [{ title, pageid, views, rank, view_history, description, extract, thumbnail, originalimage, content_urls }] }`
- `onthisday`: `[{ text, year, pages: [{ title, pageid, extract, content_urls }] }]`
- `image`: `{ title, image: { source, width, height }, thumbnail: { source, width, height } }`

### Key facts

- `mostread.date` is typically one day behind the requested date (pageview data lags ~1 day).
- `onthisday.year` is an integer (can be negative for BCE).
- `news` and `dyk` exist only in en feed and are intentionally excluded from this command.

## Failure Signals

- Invalid or future date: HTTP 404 with JSON body `{ type: "not_found", detail: "Invalid date provided. ..." }`.
- Non-existent language subdomain: DNS/SSL connection failure before HTTP.
- Network unreachability (e.g. egress path not active): connection timeout. Map to `NETWORK_ERROR`.
- Rate limiting: not observed; defensive `RATE_LIMITED` error code reserved.
- Empty feed: not observed for valid dates; map to `EMPTY_RESULT` if all top-level fields are missing.

## Capture Assessment

This command should be captured because:

- The MediaWiki REST aggregated feed provides a single, stable endpoint for daily featured content.
- It covers the core daily-aggregation use case (featured article, most-read, on-this-day, picture-of-the-day).
- No login or API key is required.
- A node runtime implementation is sufficient; browser fallback was evaluated and rejected due to incomplete data (missing view counts) and language-specific selector maintenance cost.
