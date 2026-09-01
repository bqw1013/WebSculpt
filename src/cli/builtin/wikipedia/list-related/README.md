# wikipedia/list-related

List the in-page links (related articles) of a Wikipedia article.

## Description

This command queries the public MediaWiki Action API (`prop=links`) and returns the main-namespace articles linked from a given Wikipedia article's body. Each result includes the linked article's title, namespace, and URL. It is useful for topic expansion and discovering related entries.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `title`   | yes      | -       | Article title (e.g. `{article_title}`) or full URL `https://{lang}.wikipedia.org/wiki/{article_title}`. |
| `limit`   | no       | `20`    | Number of related links to return (`1`–`500`). |
| `language`| no       | `zh`    | MediaWiki language edition code. |

## Return Value

```json
{
  "title": "{article_title}",
  "pageid": 123456,
  "language": "{language_code}",
  "count": 20,
  "links": [
    {
      "title": "{related_title_1}",
      "ns": 0,
      "url": "https://{language_code}.wikipedia.org/wiki/{related_title_1}"
    },
    {
      "title": "{related_title_2}",
      "ns": 0,
      "url": "https://{language_code}.wikipedia.org/wiki/{related_title_2}"
    }
  ]
}
```

- `links` contains only main-namespace (`ns: 0`) articles.
- `count` is the actual number of returned links and may be smaller than `limit` when the article has fewer links.

## Usage

```bash
websculpt wikipedia list-related --title "{article_title}"
websculpt wikipedia list-related --title "{article_title}" --limit 50
websculpt wikipedia list-related --title "https://en.wikipedia.org/wiki/{article_title}" --limit 10
```

## Common Error Codes

- `INVALID_PARAM` — missing or invalid `title`, `limit`, or `language`.
- `NOT_FOUND` — the requested article does not exist.
- `NETWORK_ERROR` — could not reach the Wikipedia API (check network/egress path).
- `RATE_LIMITED` — Wikipedia returned a 429 rate-limit response.

## Prerequisites

- Internet access to `wikipedia.org` (a suitable egress path may be required in restricted networks).
- No login or API key required.
- The command relies on `curl`, which respects standard proxy-related environment variables when they are set.
