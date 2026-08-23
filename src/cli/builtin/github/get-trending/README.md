# github/get-trending

## Description

Fetch the **real** GitHub trending repositories from `https://github.com/trending`, returning the actual ranked cards (this replaces the previous Search-API approximation, which was rate-limited to 10 req/min and did not match the real ranking).

Requires Chrome or Edge running with remote debugging enabled. No login required.

## Parameters

| Parameter | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `--since` | enum | no | `daily` | Period tab: `daily`(今日) / `weekly`(本周) / `monthly`(本月). Maps to `?since=` on github.com/trending. |
| `--language` | string | no | - | Primary programming language filter, e.g. `python`, `javascript`, `rust`, `c++`. Maps to the `/trending/<language>` URL path. |
| `--limit` | number | no | 20 | Max repos to return (1-25). The trending page length varies by period/language (about 12-24); `limit` truncates and the response reports `available`. |

## Return Value

```json
{
  "source": "github.com/trending",
  "since": "daily",
  "language": "python",
  "count": 19,
  "available": 19,
  "partial": false,
  "repositories": [
    {
      "rank": 1,
      "full_name": "google / skills",
      "html_url": "https://github.com/google/skills",
      "description": "Agent Skills for Google products and technologies",
      "language": "Python",
      "stars": 16883,
      "stars_gained": 481,
      "forks": 1376,
      "builders": ["cloud-ix-copybara", "holtskinner"]
    }
  ]
}
```

- `stars_gained` = stars gained in the selected period (today / this week / this month).
- `partial` = `true` when `limit` truncated the page list (i.e. `limit < available`).
- `builders` = contributor/maintainer logins (may be an empty array).

## Usage

```
websculpt github get-trending
websculpt github get-trending --since weekly --language python --limit 20
websculpt github get-trending --since monthly --limit 10
```

## Common Error Codes

- `INVALID_PARAM` — `since` not in `daily|weekly|monthly`, or `limit` not an integer in 1-25.
- `EMPTY_RESULT` — page returned 0 repositories (e.g. unknown language with no trending repos).
- `NETWORK_ERROR` — page load or SSR fetch failed, or GitHub rate-limit/bot check detected.
- `NOT_FOUND` — reserved in the shared browser-runtime error set (github.com/trending itself does not 404).
- `BROWSER_ATTACH_REQUIRED` — browser is not connected (produced by the daemon).
