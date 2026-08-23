# techmeme/search

Search Techmeme's news archive by keyword. This is the same corpus and ranking as
the on-site search box at `https://www.techmeme.com/search` — results are newest
first, each card carrying the title, editor summary, author, source, original URL,
publish time, story-cluster permalink, and image.

No login, no browser, no API key: the command fetches the public static HTML with
the Node `fetch` runtime.

## Description

Returns matching Techmeme story cards for a keyword query, newest first. Multi-word
queries are AND-matched by the site; native search operators (`sourceurl:`,
`sourcename:`, `date:`, `author:`, `title:`, `body:`, `link:`, `+ - AND OR NOT`,
quoted phrases) pass straight through to the server. The command paginates
internally (Techmeme renders 10 items per page) up to the requested `--limit`
(max 1000, the site's ~1000-item pagination cap).

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `q` | yes | — | Search keywords. Free text; supports space-separated multi-word (AND) and native Techmeme operators (`sourceurl:`, `sourcename:`, `date:`, `author:`, `title:`, `body:`, `link:`, `+ - AND OR NOT`, quoted phrases). Examples: `anthropic`, `openai funding`, `sourcename:"Bloomberg"`. |
| `limit` | no | 20 | Maximum number of results to return (1-1000). Paginated internally; `partial:true` is set on each item when the site has fewer matching results than requested. |

## Return Value

Returns an **array** of result objects (empty array for a no-match search, not an error):

```js
[
  {
    title: "Austin-based Smack Technologies ...",   // decoded title
    summary: "Smack Technologies, a defense-technology startup ...", // decoded; may be ""
    author: "Mike Stone",                            // string or null
    source: { name: "Reuters", url: "http://www.reuters.com/" },
    url: "https://www.reuters.com/technology/...",   // original article URL
    published_at: "Aug 19, 2026, 12:15 AM",          // raw site text
    permalink: "https://www.techmeme.com/260819/p1", // story-cluster page (feeds techmeme/get-story)
    image: "https://www.techmeme.com/260819/i1.jpg", // absolute URL, "" when absent
    partial: true                                    // only present when results < limit
  }
]
```

## Usage

```
websculpt techmeme search --q "anthropic"
websculpt techmeme search --q "openai funding" --limit 50
websculpt techmeme search --q 'sourcename:"The Information"' --limit 10
```

## Common Error Codes

- `MISSING_PARAM` — `q` was not provided or is empty.
- `INVALID_PARAM` — `limit` is not an integer or is outside 1-1000.
- `RATE_LIMITED` — Techmeme blocked the request (HTTP 403/429).
- `API_ERROR` — non-200 response or an empty/truncated body.
- `NETWORK_ERROR` — fetch/abort failure while reaching Techmeme.

An empty search result is **not** an error: the command returns `[]`.
