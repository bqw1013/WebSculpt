# github/list-collections

List GitHub's curated Collections (收藏集) from the A-Z index at `https://github.com/collections`.

## Description

Reads the SSR-rendered collections page and returns the stable A-Z index of curated collection cards (title, description, URL). The page shows a fixed 20-card index; `limit` only truncates it. The page's top "featured" spotlight (3 cover cards) is a rotating subset and is deliberately excluded so the output stays reproducible.

## Parameters

- `limit` (number, optional, default `20`, range 1–100): Maximum collections to return. `available` is always 20 (the fixed index size); `partial` is `true` when `limit < 20`. Values outside 1–100 or non-integer values raise `INVALID_PARAM`.

## Return Value

```json
{
  "source": "github.com/collections",
  "count": 20,
  "available": 20,
  "partial": false,
  "collections": [
    { "title": "string", "description": "string", "url": "https://github.com/collections/<slug>" }
  ]
}
```

- `source`: the data source URL.
- `count`: number of collections actually returned (after `limit` truncation).
- `available`: the true number of cards on the page (always 20 today).
- `partial`: `true` when the result was truncated (`limit < available`).
- `collections`: the list of collection cards. `url` is the absolute collection page link, ready for a future detail command.

## Usage

```
websculpt github list-collections
websculpt github list-collections --limit 20
websculpt github list-collections --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — `limit` is not an integer or is outside 1–100.
- `NOT_FOUND` — `github.com/collections` returned HTTP 404.
- `NETWORK_ERROR` — page failed to load, or GitHub served a 429/403/rate-limit/CAPTCHA page.
- `DRIFT_DETECTED` — page loaded but the expected card selector (`article.d-flex.border-bottom`) matched nothing; structure may have changed.
- `BROWSER_ATTACH_REQUIRED` — Chrome/Edge with remote debugging is not connected (raised by the runner).

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled (same as all GitHub commands). No login required.
