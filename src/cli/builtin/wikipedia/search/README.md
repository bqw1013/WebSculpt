# wikipedia/search

Search a Wikipedia language edition by keyword.

## Description

This command queries the public MediaWiki Action API and returns a ranked list of matching articles. Each result includes the article title, URL, a text snippet with search-term highlighting, last-updated timestamp, page ID, and size information.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query`   | yes      | -       | Search keyword. |
| `limit`   | no       | `10`    | Number of results to return (`1`–`50`). |
| `offset`  | no       | `0`     | Number of results to skip, for pagination. |
| `language`| no       | `zh`    | MediaWiki language edition code. |

## Return Value

```json
{
  "query": "{query}",
  "language": "{language}",
  "count": 10,
  "total": {total},
  "offset": 0,
  "items": [
    {
      "title": "{title}",
      "pageid": {pageid},
      "url": "https://{language}.wikipedia.org/wiki/{title}",
      "snippet": "...<span class=\"searchmatch\">{query}</span>...",
      "timestamp": "{timestamp}",
      "size": {size},
      "wordcount": {wordcount}
    }
  ]
}
```

`snippet` preserves the original `<span class="searchmatch">` highlight markers returned by the API.

## Usage

```bash
websculpt wikipedia search --query "{query}"
websculpt wikipedia search --query "{query}" --limit 5 --language en
websculpt wikipedia search --query "{query}" --offset 10
```

## Common Error Codes

- `INVALID_PARAM` — missing or invalid `query`, `limit`, `offset`, or `language`.
- `EMPTY_RESULT` — no articles matched the query.
- `NETWORK_ERROR` — could not reach the Wikipedia API (check network/egress path).
- `RATE_LIMITED` — Wikipedia returned a 429 rate-limit response.

## Prerequisites

- Internet access to `wikipedia.org` (a suitable egress path may be required in restricted networks).
- No login or API key required.
- The command respects standard proxy-related environment variables when they are set.
