# devto/search

Search DEV.to articles by keyword.

## Description

This command searches DEV.to for articles matching a keyword. It uses the public Forem API first when sorting by relevance, and falls back to the DEV.to search page when the API fails or when sorting by newest/oldest. The public API does not support sorting, so newest/oldest always use the browser page.

## Parameters

- `query` (required): Search keyword, e.g. a programming language, framework, or topic.
- `sort` (optional): Result order.
  - `relevance` (default): API-first, falls back to browser on API failure.
  - `newest`: Most recent first (browser path).
  - `oldest`: Oldest first (browser path).
- `limit` (optional): Maximum number of articles to return, 1–1000. Default `20`.

## Return Value

```json
{
  "query": "<keyword>",
  "sort": "relevance",
  "source": "api",
  "articles": [
    {
      "id": 123456,
      "title": "Article title",
      "description": "Article description...",
      "url": "https://dev.to/<author>/<slug>",
      "path": "/<author>/<slug>",
      "slug": "<slug>",
      "tags": ["tag1", "tag2"],
      "published_at": "2026-08-30T00:00:00.000Z",
      "created_at": "2026-08-28T00:00:00.000Z",
      "comments_count": 4,
      "public_reactions_count": 12,
      "positive_reactions_count": 12,
      "reading_time_minutes": 5,
      "cover_image": "https://...",
      "user": {
        "name": "Author Name",
        "username": "<author>",
        "github_username": "<github_handle>",
        "profile_image": "https://..."
      }
    }
  ]
}
```

When the browser path is used, each article also includes `published_at_text` (the original relative date shown on the page, e.g. `Aug 30`) and `source` is `"browser"`. Reaction counts are not available from the browser path because the search result cards do not display them.

## Usage

```bash
websculpt devto search --query "typescript"
websculpt devto search --query "rust" --sort newest --limit 10
websculpt devto search --query "web development" --sort oldest --limit 5
```

## Common Error Codes

- `INVALID_PARAM`: Missing or invalid `query`, `sort`, or `limit`.
- `EMPTY_RESULT`: No articles found for the query.
- `NETWORK_ERROR`: Both the API and browser paths failed.
- `BROWSER_ATTACH_REQUIRED`: Browser fallback was needed but browser remote debugging is not available.
