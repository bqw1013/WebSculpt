# wikipedia/list-revisions

List the recent edit history of a Wikipedia article.

## Description

This command queries the public MediaWiki Action API and returns the revision history of a Wikipedia article. Each revision includes its ID, parent ID, UTC timestamp, editor username, edit summary, article size at that revision, tags, parsed comment, and a permanent link.

The command supports any language edition and accepts either an article title or a full Wikipedia article URL.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `title`   | yes      | -       | Article title (e.g. `{title}`) or full URL (e.g. `https://{lang}.wikipedia.org/wiki/{title}`). |
| `limit`   | no       | `20`    | Maximum number of revisions to return (`1`–`500`). |
| `language`| no       | `zh`    | MediaWiki language edition code. |

## Return Value

```json
{
  "title": "{title}",
  "language": "zh",
  "pageid": 123456,
  "count": 20,
  "revisions": [
    {
      "revid": {revid},
      "parentid": {parentid},
      "timestamp": "{timestamp}",
      "user": "{editor}",
      "comment": "/* {section} */",
      "parsedcomment": "<span class=\"autocomment\">...</span>",
      "size": {size},
      "tags": ["{tag}"],
      "url": "https://zh.wikipedia.org/w/index.php?title={title}&oldid={revid}"
    }
  ]
}
```

Fields are omitted when they are `null` or `undefined`.

## Usage

```bash
websculpt wikipedia list-revisions --title "{title}"
websculpt wikipedia list-revisions --title "{title}" --limit 10
websculpt wikipedia list-revisions --title "https://en.wikipedia.org/wiki/{title}" --language en --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — missing or malformed `title`, `limit`, or `language`.
- `NOT_FOUND` — the requested article does not exist.
- `EMPTY_RESULT` — no revisions returned (should not occur for existing articles).
- `NETWORK_ERROR` — could not reach the Wikipedia API (check network/egress path).
- `RATE_LIMITED` — Wikipedia returned a 429 rate-limit response.

## Prerequisites

- Internet access to `wikipedia.org` (a suitable egress path may be required in restricted networks).
- No login or API key required.
- The command respects standard proxy-related environment variables when they are set.
