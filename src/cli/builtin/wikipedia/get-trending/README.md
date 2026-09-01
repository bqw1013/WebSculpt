# wikipedia/get-trending

Fetch the most-viewed Wikipedia articles by daily page views for a given language edition and time window.

## Description

This command queries the public Wikimedia Pageviews API and returns a ranked list of the most-viewed main-namespace articles for a Wikipedia language edition. It supports single-day (`yesterday`) and trailing-window (`7day`, `30day`) aggregations.

## Parameters

- `period` (optional, default `yesterday`): Time window. One of `yesterday`, `7day`, `30day`.
  - `yesterday`: latest available day with data.
  - `7day`: trailing 7 calendar days aggregated from yesterday backward.
  - `30day`: trailing 30 calendar days aggregated from yesterday backward.
- `limit` (optional, default `20`): Number of results to return. Integer between `1` and `100`.
- `language` (optional, default `zh`): MediaWiki language code for the Wikipedia edition (e.g. `zh`, `en`, `ja`, `ko`).

## Return Value

```json
{
  "period": "yesterday",
  "generated_at": "2026-08-30T12:00:00.000Z",
  "language": "zh",
  "items": [
    {
      "title": "<article-title>",
      "views": 123456,
      "rank": 1,
      "url": "https://zh.wikipedia.org/wiki/<article-title>"
    }
  ]
}
```

- `period`: the requested time window.
- `generated_at`: ISO 8601 timestamp of command execution.
- `language`: the requested Wikipedia language edition.
- `items`: array of ranked articles, sorted by views descending.
  - `title`: article title in the main namespace.
  - `views`: raw or aggregated page view count.
  - `rank`: 1-based rank after filtering and sorting.
  - `url`: link to the article page.

## Usage

```bash
# Latest available single-day ranking
websculpt wikipedia get-trending

# Trailing 7-day aggregation, top 10
websculpt wikipedia get-trending --period 7day --limit 10

# English edition, trailing 30-day aggregation, top 50
websculpt wikipedia get-trending --period 30day --limit 50 --language en
```

## Common Error Codes

- `INVALID_PARAM`: invalid `period`, `limit` out of range, or malformed `language` code.
- `NOT_FOUND`: no pageview data is available for the requested language or date window.
- `EMPTY_RESULT`: data was returned, but no main-namespace articles remain after filtering.
- `NETWORK_ERROR`: connection failure to `wikimedia.org` (often needs a suitable egress path in restricted networks).
- `RATE_LIMITED`: defensive code for Wikimedia API rate limiting.

## Notes

- The command respects standard proxy-related environment variables when connecting to the Wikimedia API.
- The Wikimedia Pageviews API lags by about one day; `yesterday` therefore resolves to the most recent available date rather than the literal previous calendar day.
- Non-article pages (titles containing `:`) are filtered out to keep the ranking focused on encyclopedia articles.
