# reddit/get-post

Fetch a single Reddit post detail page via browser automation.

## Description

This command navigates to a Reddit post detail page in an attached browser, extracts the post metadata and body (or external link), and returns the visible comments as a nested reply tree. It is useful for getting the full content and discussion of a post that was discovered through `reddit/get-feed`, `reddit/get-popular`, or `reddit/search`.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `permalink` | Yes | — | Post permalink. Can be a full URL (`https://www.reddit.com/r/...`) or a path (`/r/.../comments/.../`). |
| `sort` | No | `best` | Comment sort order: `best`, `top`, `new`, `controversial`, `qa`. |
| `limit` | No | `0` | Maximum number of comments to return. `0` returns all comments currently loaded on the page. |
| `depth` | No | `0` | Only return comments whose `depth` is <= this value. `0` means no depth limit. |
| `include_comments` | No | `true` | Whether to include comments in the output: `true` or `false`. |

## Return Value

```json
{
  "post": {
    "id": "t3_<post-id>",
    "title": "Post title",
    "author": "username",
    "subreddit": "r/subredditname",
    "score": 25,
    "commentCount": 31,
    "upvoteRatio": 0.879,
    "type": "text",
    "url": "https://www.reddit.com/r/subredditname/comments/<post-id>/...",
    "body": "Post body text ...",
    "created": "2024-09-01T10:17:28.299Z",
    "permalink": "/r/subredditname/comments/<post-id>/..."
  },
  "comments": [
    {
      "id": "t1_<comment-id>",
      "author": "username",
      "score": 53,
      "depth": 0,
      "permalink": "/r/subredditname/comments/<post-id>/comment/<comment-id>/",
      "created": "2024-09-01T...",
      "body": "Comment body ...",
      "collapsed": false,
      "children": [
        {
          "id": "t1_<reply-id>",
          "author": "username",
          "score": 5,
          "depth": 1,
          "permalink": "/r/subredditname/comments/<post-id>/comment/<reply-id>/",
          "created": "2024-09-01T...",
          "body": "Reply body ...",
          "collapsed": false,
          "children": []
        }
      ]
    }
  ],
  "totalComments": 31,
  "returnedComments": 30,
  "sort": "best"
}
```

## Usage

```bash
# Default: post + all loaded comments sorted by best
websculpt reddit get-post --permalink https://www.reddit.com/r/AskReddit/comments/1v7z1m7/what_industry_is_secretly_on_the_verge_of/

# Top comments only, limit 20
websculpt reddit get-post --permalink /r/AskReddit/comments/1v7z1m7/what_industry_is_secretly_on_the_verge_of/ --sort top --limit 20

# Newest top-level comments only
websculpt reddit get-post --permalink /r/AskReddit/comments/1v7z1m7/... --sort new --depth 0 --limit 10

# Post only, skip comments
websculpt reddit get-post --permalink /r/AskReddit/comments/1v7z1m7/... --include_comments false
```

## Timing & Polite Pacing Behavior

The command uses conservative random delays and occasional small mouse movement to keep a polite pacing profile without making the call unnecessarily slow:

| Stage | Delay |
|-------|-------|
| After post element loads | 200–500 ms |
| Between lazy-load scrolls | 300–800 ms |
| Before returning results | 0–500 ms |

Mouse movement is triggered roughly half the time and kept within a small central viewport area.

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | `permalink` is missing. |
| `INVALID_PARAM` | `sort`, `limit`, `depth`, or `permalink` is invalid. |
| `TIMEOUT` | Page navigation timed out. |
| `BLOCKED` | Reddit applied platform rate limiting. |
| `DRIFT_DETECTED` | The expected Reddit post structure was not found. |
