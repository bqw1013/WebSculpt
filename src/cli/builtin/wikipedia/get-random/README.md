# wikipedia/get-random

Fetch one or more random Wikipedia articles from a language edition.

## Description

This command uses the public MediaWiki Action API `list=random` to retrieve random main-namespace articles. It is useful for discovery, daily sampling, or "learn something new" workflows.

## Parameters

- `limit` (number, optional): Number of random articles to return. Range `1-500`, default `1`.
- `language` (string, optional): MediaWiki language code for the Wikipedia edition. Default `zh`. Common examples: `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `ru`.

## Return Value

```json
{
  "language": "zh",
  "count": 3,
  "items": [
    {
      "pageid": 1234567,
      "title": "Article Title",
      "url": "https://zh.wikipedia.org/wiki/Article%20Title"
    }
  ]
}
```

- `language`: the language edition actually queried.
- `count`: number of articles returned (≤ `limit`).
- `items`: array of random articles, each with `pageid`, `title`, and `url`.

## Usage

```bash
# Default: 1 random article from zh.wikipedia.org
websculpt wikipedia get-random

# 5 random articles from English Wikipedia
websculpt wikipedia get-random --limit 5 --language en

# 50 random articles from Japanese Wikipedia
websculpt wikipedia get-random --limit 50 --language ja
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not an integer or outside `1-500`; `language` contains invalid characters.
- `EMPTY_RESULT`: the API returned no usable articles (rare).
- `NETWORK_ERROR`: cannot reach the Wikipedia domain (check internet or egress path).
- `RATE_LIMITED`: Wikimedia returned a rate-limit response.
- `DRIFT_DETECTED`: the API response structure changed unexpectedly.

## Prerequisites

- Internet access to `*.wikipedia.org`.
- In restricted network environments, a suitable egress path may be required.
- No login or API key needed.
