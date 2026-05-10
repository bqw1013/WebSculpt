# hackernews/get-top

Fetch top stories from the HackerNews front page.

## Description

This command queries the HackerNews Algolia Search API for stories currently on the front page (`tags=front_page`). It returns structured metadata for each story, including title, external URL, HN discussion link, vote count, comment count, author, and submission time.

No authentication or browser is required.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `15` | Number of stories to return. Range: 1–30. Values above 30 are clamped to 30. |
| `sortBy` | No | `points` | Sort order. `"points"` sorts by upvote count (descending). `"comments"` sorts by comment count (descending). |

## Return Value

An array of story objects, each containing:

| Field | Type | Description |
|-------|------|-------------|
| `rank` | number | Position in the returned list (1-based) |
| `title` | string | Story title |
| `url` | string \| null | External article URL (null for text-only posts) |
| `hnUrl` | string | Direct link to the HackerNews discussion page |
| `points` | number | Upvote count |
| `numComments` | number | Number of comments |
| `author` | string | Submitter username |
| `createdAt` | string | ISO 8601 submission timestamp |
| `storyId` | string | HackerNews story identifier |

## Usage

```bash
# Default: top 15 stories sorted by points
websculpt hackernews get-top

# Get top 5 stories
websculpt hackernews get-top --limit 5

# Get top 30 stories sorted by most commented
websculpt hackernews get-top --limit 30 --sortBy comments
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_PARAM` | `limit` is not a valid positive integer, or `sortBy` is unsupported. |
| `NETWORK_ERROR` | HTTP request failed or timed out. |
| `API_ERROR` | Algolia API returned a non-2xx status code. |
| `RATE_LIMITED` | API rate limit was hit (rare for this public endpoint). |
| `PARSE_ERROR` | Response body could not be parsed as JSON. |
| `DRIFT_DETECTED` | API response structure changed unexpectedly (e.g., missing `hits` array). |
