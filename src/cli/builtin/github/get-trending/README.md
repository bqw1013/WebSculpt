# github/get-trending

A `node` runtime command that fetches trending GitHub repositories based on recent activity and star count.

## Description

This command queries the GitHub Search API to find repositories that have been recently pushed to (active) and ranks them by total star count. It approximates "trending" behavior by combining recency filters with popularity sorting.

## Parameters

- `period` (string, optional): Time range for recent activity. One of `daily`, `weekly`, `monthly`. Default: `weekly`.
- `language` (string, optional): Filter by primary programming language, e.g. `python`, `javascript`, `rust`, `go`.
- `limit` (integer, optional): Number of repositories to return. Range: 1–50. Default: `10`.

## Return Value

Returns an object with the following structure:

```json
{
  "total_count": 12345,
  "query": "pushed:>2026-05-02 stars:>10",
  "period": "weekly",
  "limit": 10,
  "repositories": [
    {
      "rank": 1,
      "name": "repo-name",
      "full_name": "owner/repo-name",
      "owner": "owner",
      "owner_avatar": "https://avatars.githubusercontent.com/u/...",
      "description": "Project description",
      "stars": 50000,
      "language": "TypeScript",
      "url": "https://github.com/owner/repo-name",
      "created_at": "2023-01-15T08:00:00Z",
      "pushed_at": "2026-05-08T12:00:00Z"
    }
  ]
}
```

## Usage

```bash
# Default: weekly trending, all languages, top 10
websculpt github get-trending

# Daily trending Python repos
websculpt github get-trending --period daily --language python

# Top 20 monthly trending Rust repos
websculpt github get-trending --period monthly --language rust --limit 20
```

## Common Error Codes

- `RATE_LIMIT`: GitHub API rate limit exceeded (10 req/min unauthenticated). Retry after a minute.
- `INVALID_PARAM`: `period` or `limit` parameter is invalid.
- `INVALID_QUERY`: GitHub API rejected the query (e.g. invalid language).
- `EMPTY_RESULT`: No repositories matched the search criteria.
- `NETWORK_ERROR`: Failed to connect to GitHub API.
- `TIMEOUT`: Request timed out after 15 seconds.
