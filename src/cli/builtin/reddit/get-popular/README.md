# reddit/get-popular

Fetch Reddit `/r/popular/` feed via browser automation.

## Description

This command retrieves a list of posts from Reddit's site-wide `/r/popular/` feed by navigating in a real browser and extracting structured data from the page's `shreddit-post` web components. It reads data through a real, interactive browser session instead of headless HTTP clients.

`/r/popular/` shows posts from across Reddit that are currently popular, filtered to avoid overly niche or NSFW communities by default.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `20` | Number of posts to return. Integer between `1` and `100`. |
| `sort` | No | `best` | Sort order: `best`, `hot`, `top`, `rising`, or `new`. |
| `time` | No | `day` | Time range when `sort=top`: `hour`, `day`, `week`, `month`, `year`, or `all`. Ignored for other sort values. |

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
# Default: 20 best posts from /r/popular/
websculpt reddit get-popular

# Top 10 posts of the week
websculpt reddit get-popular --limit 10 --sort top --time week

# Rising posts
websculpt reddit get-popular --sort rising --limit 5

# Latest new posts
websculpt reddit get-popular --sort new --limit 20
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `TIMEOUT` | Page navigation exceeded 15 seconds |
| `INVALID_PARAM` | `limit` is not an integer between 1 and 100, `sort` is invalid, or `time` is invalid |
| `EMPTY_RESULT` | No posts were found on the page |
| `BLOCKED` | Platform rate limiting applied; log in to Reddit in the browser and retry |
| `DRIFT_DETECTED` | Reddit page structure changed unexpectedly |
