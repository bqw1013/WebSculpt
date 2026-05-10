# reddit/get-hot

Fetch trending posts from Reddit's front-page feed via browser automation.

## Description

This command retrieves a list of trending Reddit posts by navigating to Reddit in a real browser and extracting structured data from the page's `shreddit-post` web components. It bypasses API-level restrictions that affect headless HTTP clients.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `5` | Number of posts to return (1-100) |
| `sort` | No | `hot` | Sort order: `hot`, `top`, `rising`, or `new` |

## Return Value

```json
{
  "sort": "hot",
  "limit": 5,
  "total": 5,
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
# Default: 5 hot posts
websculpt reddit get-hot

# Top 10 posts
websculpt reddit get-hot --limit 10 --sort top

# Rising posts
websculpt reddit get-hot --sort rising --limit 5
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `TIMEOUT` | Page navigation exceeded 15 seconds |
| `INVALID_PARAM` | `limit` is not a positive integer |
| `EMPTY_RESULT` | No posts were found on the page |
| `DRIFT_DETECTED` | Reddit page structure changed unexpectedly |
