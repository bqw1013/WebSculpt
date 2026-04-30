# zhihu/list-posts

Fetch the latest articles from a Zhihu user's posts page.

## Description

This command navigates to a Zhihu user's posts page and extracts the latest articles, including title and URL.

## Prerequisites

This command requires a live browser automation session via `playwright-cli`. Before using it:

1. Open Chrome or Edge and visit `chrome://inspect/#remote-debugging`
2. Enable **"Allow this browser instance to be remotely debugged"**
3. In your terminal, run:
   ```bash
   playwright-cli attach --cdp=chrome --session=default
   ```
4. Then you can call this command

> If the browser session is not attached, you will see the `PLAYWRIGHT_CLI_ATTACH_REQUIRED` error.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `user` | Yes | — | Zhihu user ID (e.g., `example-zhihu-user`) or full profile URL |
| `limit` | No | `10` | Maximum number of articles to return |

## Return Value

```json
{
  "userId": "example-zhihu-user",
  "postsUrl": "https://www.zhihu.com/people/example-zhihu-user/posts",
  "total": 10,
  "posts": [
    {
      "title": "Article title",
      "url": "https://zhuanlan.zhihu.com/p/123456789"
    }
  ]
}
```

## Usage Examples

Fetch latest 10 articles:

```bash
websculpt zhihu list-posts --user example-zhihu-user
```

Fetch latest 5 articles:

```bash
websculpt zhihu list-posts --user example-zhihu-user --limit 5
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `MISSING_PARAM` | The `user` parameter is required. |
| `NOT_FOUND` | User does not exist or profile is unavailable. |
| `AUTH_REQUIRED` | Zhihu requires login to view this page. |
| `DRIFT_DETECTED` | Article list selector not found. Page structure may have changed. |
| `EMPTY_RESULT` | No articles found for the user. |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | Browser CDP session is not attached. |
