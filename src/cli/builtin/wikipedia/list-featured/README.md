# wikipedia/list-featured

## Description

List Wikipedia featured content for a language edition. Supports featured articles, featured lists, and featured pictures across multiple language editions via the public MediaWiki Action API.

## Runtime

Node (direct MediaWiki Action API calls, no browser).

## Parameters

- `kind` (optional): `articles` | `lists` | `images`. Default: `articles`.
- `limit` (optional): Maximum number of items to return. Default: `20`.
- `language` (optional): MediaWiki language code. Default: `zh`.

## Supported languages and kinds

| Language | Articles | Lists | Images |
|----------|----------|-------|--------|
| `zh`     | yes      | yes   | yes    |
| `en`     | yes      | yes   | yes    |
| `ja`     | yes      | yes   | yes    |
| `ko`     | yes      | yes   | no     |
| `fr`     | yes      | no    | no     |
| `de`     | yes      | no    | yes    |
| `es`     | yes      | no    | no     |
| `ru`     | yes      | yes   | no     |
| `pt`     | yes      | yes   | yes    |
| `it`     | yes      | no    | no     |

Unmapped languages or kinds return `EMPTY_RESULT`.

## Output

```json
{
  "kind": "articles",
  "language": "zh",
  "category": "{category}",
  "limit": 20,
  "count": 20,
  "has_more": true,
  "items": [
    {
      "pageid": 123456,
      "ns": 0,
      "type": "page",
      "title": "{featured_title}",
      "url": "https://zh.wikipedia.org/wiki/{featured_title}"
    }
  ]
}
```

For `images`, `title` is `File:{name}` (or the localized file prefix) and `url` points to the file description page.

## Usage

```bash
# Featured articles in Chinese (default)
websculpt wikipedia list-featured

# Featured lists in English
websculpt wikipedia list-featured --kind lists --language en

# Featured pictures in Japanese, up to 50 items
websculpt wikipedia list-featured --kind images --language ja --limit 50
```

## Errors

- `INVALID_PARAM` — invalid `kind`, non-positive `limit`, or malformed `language`.
- `EMPTY_RESULT` — language/kind is not mapped, or the category has no members.
- `NETWORK_ERROR` — network failure or non-2xx response from Wikipedia.
- `RATE_LIMITED` — Wikipedia returned HTTP 429.
