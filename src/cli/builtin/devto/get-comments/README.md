# devto/get-comments

Fetch comments on a DEV.to article.

## Description

`websculpt devto get-comments` retrieves the comments for a single DEV.to article. It uses the public Forem API as the primary source and falls back to extracting the visible comments from the article page when the API cannot be reached.

When the browser fallback is used, only the subset of comments rendered by the page is returned. This is indicated by `truncated: true` in the output.

## Parameters

- `--article_url` — Full DEV.to article URL, e.g. `https://dev.to/{username}/{slug}`. Provide this OR `--article_id`.
- `--article_id` — Numeric DEV.to article id. Provide this OR `--article_url`.
- `--limit` — Maximum number of top-level comments to return (1-1000, default 50). The public API does not paginate, so the limit is applied client-side.
- `--include_children` — Whether to include nested replies (`true` | `false`, default `true`).

## Return Value

```json
{
  "article_id": 1234567,
  "article_url": "https://dev.to/{username}/{slug}",
  "comments_count": 26,
  "comments": [
    {
      "id_code": "abc12",
      "created_at": "2026-08-28T13:27:17Z",
      "body_html": "<p>...</p>",
      "user": {
        "name": "...",
        "username": "...",
        "profile_image": "..."
      },
      "children": []
    }
  ],
  "source": "api"
}
```

When the browser fallback is active, the output also contains `truncated: true`.

## Usage

```bash
websculpt devto get-comments --article_url "https://dev.to/{username}/{slug}"
websculpt devto get-comments --article_id 1234567 --limit 10
websculpt devto get-comments --article_url "https://dev.to/{username}/{slug}" --include_children false
```

## Common Error Codes

- `INVALID_PARAM` — Missing or conflicting parameters, malformed URL, or invalid `limit`.
- `NOT_FOUND` — The article does not exist.
- `EMPTY_RESULT` — The article exists but has no comments.
- `RATE_LIMITED` — The API returned HTTP 429 and the browser fallback also failed.
- `NETWORK_ERROR` — API or page could not be loaded.
- `BROWSER_ATTACH_REQUIRED` — Browser fallback needed but browser remote debugging is not available.
