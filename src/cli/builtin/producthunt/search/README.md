# producthunt/search

Search Product Hunt's public search pages by query. This command only searches; it does not open product details, vote, review, comment, submit, follow, or perform any other mutation.

## Description

The command reads Product Hunt's Apollo server-rendered search connection first, follows numbered result pages serially, and falls back to visible search DOM only when page data or transport fails.

## Parameters

- `query` (required): search text.
- `limit` (optional, default `20`): strict positive integer, maximum `100` (`LIMIT_EXCEEDED` above the maximum).
- `type` (optional, default `product`): `product`, `launch`, or `user`. These map to Product Hunt's Products, Launches, and Users search pages.
- `sort` (optional, default `default`): accepts `default`, `latest`, or `popular`. Product Hunt's current search URL has no verified sort control, so non-default values are returned in `ignoredParams`.
- `time` (optional, default `all`): accepts `all`, `day`, `week`, `month`, or `year`. Product Hunt's current search URL has no verified time control, so non-`all` values are returned in `ignoredParams`.

## Return value

The envelope includes `query`, `type`, `sort`, `time`, `maxLimit`, `resultCount`, `pagesFetched`, `source`, `fallbackUsed`, and `nativeEnvelope`. API/page-data results are under `results` and preserve each native Product Hunt search node under `results[].native`. Each normalized record also includes `id`, type-specific ID, `name`, `title`, `tagline`, `slug`, `url`, `image`, `logoUuid`, `makers`, `topics`, `publishedAt`, `metrics` (votes/comments/reviews/rating where search data exposes them), and `isNoLongerOnline`. Missing platform fields are `null`.

The command follows search page pagination internally (serially, up to 12 pages) until `limit` is reached. A valid empty connection is returned as an empty result and does not trigger fallback. If Apollo page data is unavailable or its schema drifts, the command reloads the search URL and extracts visible DOM results, returning `source: "dom"`, `fallbackUsed: true`, `partial: true`, and `fallbackReason`. If both paths fail, it throws `DRIFT_DETECTED`.

## Usage

```bash
websculpt producthunt search --query "artificial intelligence" --limit 10
websculpt producthunt search --query "developer tools" --type launch --limit 5
websculpt producthunt search --query "design" --type user --limit 5 --sort latest --time month
```

## Browser and pacing

Chrome or Edge remote debugging must be enabled so WebSculpt can attach to the user's existing browser session. No API key is expected for public results. Navigation and page requests are serial with short randomized waits; DOM fallback waits for result selectors and performs only one low-amplitude pointer/scroll nudge. The command does not open detail pages, fan out requests, bypass CAPTCHA/403/429, or perform bulk scrolling.

## Common error codes

- `MISSING_PARAM`: query is absent or blank.
- `INVALID_PARAM`: malformed limit or unsupported type/sort/time value.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `DRIFT_DETECTED`: Apollo page data and visible DOM fallback both failed.
- `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, and `COMMAND_TIMEOUT` may be emitted by the browser runner.
