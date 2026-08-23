# reddit/get-feed

Fetch Reddit front-page feed via browser automation.

## Description

This command retrieves a list of Reddit posts from the front-page feed by navigating to Reddit in a real browser and extracting structured data from the page's `shreddit-post` web components. It reads data through a real, interactive browser session instead of headless HTTP clients.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `20` | Number of posts to return (1-100) |
| `sort` | No | `best` | Sort order: `best`, `hot`, `top`, `rising`, or `new` |

## Return Value

```json
{
  "sort": "best",
  "limit": 20,
  "total": 20,
  "posts": [
    {
      "rank": 1,
      "title": "Post title",
      "subreddit": "r/subredditname",
      "score": 12345,
      "num_comments": 678,
      "author": "username",
      "permalink": "https://www.reddit.com/r/...",
      "url": "https://..."
    }
  ]
}
```

## Usage

```bash
# Default: 20 best posts
websculpt reddit get-feed

# Top 10 posts
websculpt reddit get-feed --limit 10 --sort top

# Rising posts
websculpt reddit get-feed --sort rising --limit 5

# Latest new posts
websculpt reddit get-feed --sort new --limit 20
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `TIMEOUT` | Page navigation exceeded 15 seconds |
| `INVALID_PARAM` | `limit` is not a positive integer, or `sort` is not one of `best`, `hot`, `top`, `rising`, `new` |
| `EMPTY_RESULT` | No posts were found on the page |
| `DRIFT_DETECTED` | Reddit page structure changed unexpectedly |
