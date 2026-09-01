# devto/get-article

Get a single DEV.to article.

## Description

This command fetches a DEV.to article by URL. It first tries the public Forem API for a fast, structured response. If the API cannot be reached or returns a server-side failure, the command falls back to extracting the article from the public HTML page using an attached browser session.

## Parameters

- `url` (required): Full DEV.to article URL. Example: `https://dev.to/{username}/{slug}`

## Return Value

On success, returns an article object. The top-level field `"source"` indicates whether the data came from `"api"` or `"browser"`.

Example API result:

```json
{
  "type_of": "article",
  "id": 123456,
  "title": "Example title",
  "description": "Short description...",
  "slug": "example-slug",
  "path": "/{username}/example-slug",
  "url": "https://dev.to/{username}/example-slug",
  "published_timestamp": "2026-08-28T13:00:00Z",
  "tags": ["tag1", "tag2"],
  "tag_list": "tag1, tag2",
  "body_html": "<p>Article body...</p>",
  "body_markdown": "Article body...",
  "user": { "name": "Author Name", "username": "{username}" },
  "organization": { "name": "Org Name", "username": "{orgname}" },
  "cover_image": "https://...",
  "source": "api"
}
```

Fields that are unavailable from a given source are omitted rather than returned as `null`.

## Usage

```bash
websculpt devto get-article --url "https://dev.to/{username}/{slug}"
```

## Common Error Codes

- `INVALID_PARAM`: The `url` is missing, malformed, or not a DEV.to article URL.
- `NOT_FOUND`: The article does not exist (API 404 or browser 404 page).
- `EMPTY_RESULT`: The page loaded but no article content could be extracted.
- `RATE_LIMITED`: The API returned 429 and the browser fallback also returned no content.
- `NETWORK_ERROR`: Could not reach the API or load the page.
- `BROWSER_ATTACH_REQUIRED`: The browser remote debugging endpoint is not available.
