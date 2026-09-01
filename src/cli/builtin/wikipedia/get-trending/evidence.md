# Evidence: wikipedia/get-trending

This document records the research and validation evidence for the `wikipedia/get-trending` command.

## Exploration Path

- Checked WebSculpt command library: no existing `wikipedia` domain or commands.
- Verified primary data source via `curl` and node fetch: Wikimedia Pageviews API `metrics/pageviews/top/{project}/{access}/{year}/{month}/{day}`.
- Evaluated browser fallback candidates via `@playwright/cli` attach to a local browser session:
  - `pageviews.wmcloud.org/topviews` — does not accept direct date parameters; default view mismatches official API.
  - `zh.wikipedia.org/wiki/Wikipedia:动态热门` — shows a single-day table for zh only, numbers differ from API.
  - `en.wikipedia.org/wiki/Wikipedia:Top_25_Report` — manually curated weekly top 25, not configurable.
  - `ja.wikipedia.org/wiki/Wikipedia:人気記事` — page exists but contains no data table.
- Conclusion: browser fallback is not equivalent or stable; command uses `node` runtime with API-only path.

## Verified URLs

- `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{yyyy}/{mm}/{dd}`
- `https://pageviews.wmcloud.org/topviews/?project={lang}.wikipedia.org`
- `https://zh.wikipedia.org/wiki/Wikipedia:动态热门`
- `https://en.wikipedia.org/wiki/Wikipedia:Top_25_Report`
- `https://ja.wikipedia.org/wiki/Wikipedia:人気記事`

## Structural Evidence

- API endpoint: `GET https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{yyyy}/{mm}/{dd}`
- Request header: identifying caller header required by Wikimedia.
- Response shape (HTTP 200):
  ```json
  {
    "items": [
      {
        "project": "zh.wikipedia",
        "access": "all-access",
        "year": "2026",
        "month": "08",
        "day": "28",
        "articles": [
          { "article": "{article_title}", "views": 123456, "rank": 1 },
          { "article": "{article_title}", "views": 12345, "rank": 2 }
        ]
      }
    ]
  }
  ```
- Each day returns up to 1,000 articles with per-day `rank` values.
- Non-mainspace titles include prefixes such as `Wikipedia:`, `Special:`, `Portal:`, `Category:`, `File:`.
- For multi-day aggregation, group by `article`, sum `views`, re-rank descending, then apply `limit`.

## Failure Signals

- HTTP 404 with structured body when the date has no data yet or project is invalid:
  ```json
  {
    "detail": "The date(s) you used are valid, but we either do not have data for those date(s), or the project you asked for is not loaded yet.",
    "status": 404,
    "title": "Not Found",
    "type": "about:blank"
  }
  ```
- TLS/connection timeout when no suitable egress path is available.
- No 429 observed in burst tests, but `RATE_LIMITED` retained as defensive error code.

## Capture Assessment

- Should be captured: yes.
- Runtime: `node`.
- The API path is public, stable, and returns structured JSON. Browser fallback was evaluated and rejected because no cross-language, configurable, API-equivalent page exists.
