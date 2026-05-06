# zhihu/get-post

Fetch the full content and metadata of a single Zhihu column article.

## Description

This command navigates to a Zhihu column article (zhuanlan.zhihu.com) and extracts the title, publish time, location, content, and engagement stats (agree, comment, share).

## Prerequisites

This command requires a live browser automation session via `playwright-cli`. Before using it:

1. Open Chrome or Edge and visit `chrome://inspect/#remote-debugging`
2. Enable **"Allow this browser instance to be remotely debugged"**
3. In your terminal, run:
   ```bash
   playwright-cli attach --cdp=chrome --session=default
   ```
4. Then you can call this command

> If the browser session is not attached, you will see the `BROWSER_ATTACH_REQUIRED` error.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `url` | Yes | — | Full URL of the Zhihu column article, e.g. `https://zhuanlan.zhihu.com/p/123456789` |

## Return Value

```json
{
  "title": "Article title",
  "publishedAt": "2026-04-30",
  "location": "Shanghai",
  "content": "Full article text...",
  "stats": {
    "agree": 123,
    "comment": 45,
    "share": 6
  }
}
```

## Usage Examples

Fetch a specific article:

```bash
websculpt zhihu get-post --url https://zhuanlan.zhihu.com/p/123456789
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `MISSING_PARAM` | The `url` parameter is required. |
| `EMPTY_RESULT` | Could not extract article content. The page structure may have changed or the article is not accessible. |
| `BROWSER_ATTACH_REQUIRED` | Browser CDP session is not attached. |
