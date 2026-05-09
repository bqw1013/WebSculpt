# Evidence: github/get-trending

This document records the research and validation evidence for the `github/get-trending` command.

## Exploration Path

1. Checked WebSculpt command library — no existing commands related to GitHub trending or repository search.
2. Used WebSearch to discover potential data sources for GitHub trending repositories.
3. Evaluated `trendshift.io` as a candidate source. Verified it is a Next.js SSR-rendered page with complex DOM structure, making it unsuitable for reliable `node` runtime extraction without browser automation.
4. Evaluated `ossinsight.io` as a candidate source. It provides trending rankings but does not expose a simple, documented public API for direct HTTP fetching.
5. Selected the **GitHub Search API** (`https://api.github.com/search/repositories`) as the primary data source. It is a stable, well-documented, public REST API that requires no authentication for basic usage and returns structured JSON.
6. To approximate "trending" behavior, the command uses `sort=stars` combined with `pushed:>{recent_date}` qualifiers to surface recently active, highly-starred repositories.

## Verified URLs

- `https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=10`
- `https://trendshift.io/` (explored but not used as primary source)

## Structural Evidence

The GitHub Search API returns a JSON object with the following structure:

```json
{
  "total_count": 61586,
  "incomplete_results": false,
  "items": [
    {
      "name": "build-your-own-x",
      "full_name": "codecrafters-io/build-your-own-x",
      "description": "Master programming by recreating your favorite technologies from scratch.",
      "stargazers_count": 500024,
      "language": "Markdown",
      "html_url": "https://github.com/codecrafters-io/build-your-own-x",
      "owner": {
        "login": "codecrafters-io",
        "avatar_url": "https://avatars.githubusercontent.com/u/58904235?v=4"
      },
      "created_at": "2018-05-09T12:03:18Z",
      "pushed_at": "2026-02-21T09:34:54Z"
    }
  ]
}
```

Key fields used by the command:
- `items` (array): list of repositories
- `items[].name` (string): repository name
- `items[].full_name` (string): owner/name
- `items[].description` (string|null): description
- `items[].stargazers_count` (number): star count
- `items[].language` (string|null): primary language
- `items[].html_url` (string): GitHub URL
- `items[].owner.login` (string): owner name
- `items[].owner.avatar_url` (string): owner avatar
- `items[].created_at` (string): ISO 8601 creation time
- `items[].pushed_at` (string): ISO 8601 last push time

## Failure Signals

- **Rate limiting**: GitHub Search API has a rate limit of 10 requests per minute for unauthenticated requests. If exceeded, API returns HTTP 403 with `X-RateLimit-Remaining: 0`.
- **Not strictly "trending"**: The GitHub Search API with `sort=stars` returns repositories with the highest total star counts, not necessarily those with the fastest recent growth. This is a known approximation.
- **Empty results**: Query combinations may return zero results. The API returns `total_count: 0` and `items: []`.
- **API drift**: GitHub may deprecate or change the Search API behavior, though this is low-frequency.
- **Authentication**: No login required, but authenticated requests have higher rate limits (30 requests per minute).

## Capture Assessment

This command should be captured. The GitHub Search API is a stable, public, documented REST API that provides structured JSON data. It is suitable for `node` runtime execution and can be parameterized effectively for language filtering, time-based recency, and result limits. While it approximates "trending" rather than providing native trending metrics, it delivers high-quality, actionable results for the target use case.
