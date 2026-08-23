# techcrunch/search

Search TechCrunch articles by keyword via TechCrunch's public WordPress REST API.

## Description

This command searches TechCrunch's article archive by a plain-text keyword and returns matching
article cards, newest first. It is equivalent to using the on-site search box
(`https://techcrunch.com/?s={query}`) — the API returns the same corpus of posts, ordered by
date descending instead of relevance.

Each result card contains: title, canonical URL, publish date, excerpt, featured image URL, and
the article's editorial category names.

No login and no browser are required — all data comes from the public REST API
(`/wp-json/wp/v2/posts?search=...`).

## Parameters

| Name    | Required | Default | Description |
|---------|----------|---------|-------------|
| `query` | yes      | —       | Search keywords, e.g. `openai` or `spacex launch`. Plain text; matches titles and content. |
| `limit` | no       | `20`    | Maximum number of results to return (1–100). The API is paginated internally (per_page=100) until the limit is reached or results run out. |

## Return Value

Returns an object:

```json
{
  "query": "openai",
  "count": 20,
  "total": 3832,
  "partial": false,
  "articles": [
    {
      "title": "…",
      "url": "https://techcrunch.com/2026/08/13/…/",
      "date": "2026-08-13T12:22:40",
      "excerpt": "…",
      "image": "https://techcrunch.com/wp-content/uploads/…/img.jpg",
      "categories": ["AI", "Startups"]
    }
  ]
}
```

- `query`: the trimmed search keyword.
- `count`: number of article cards returned (≤ `limit`).
- `total`: total number of matching posts reported by the API (`X-WP-Total` header).
- `partial`: `true` when fewer than `limit` results exist (the stream was exhausted early);
  `false` when the full `limit` was returned.
- `articles`: the article cards. `image` is `null` when a post has no featured image.
  `categories` is an array of category names (empty when none resolved).

## Usage

```
websculpt techcrunch search --query openai
websculpt techcrunch search --query "spacex launch" --limit 50
```

## Common Error Codes

- `MISSING_PARAM` — `query` is empty or missing.
- `INVALID_PARAM` — `limit` is not a positive integer in range 1–100.
- `NETWORK_ERROR` — request to the TechCrunch API failed.
- `API_ERROR` — TechCrunch API returned a non-2xx status.
- `RATE_LIMITED` — TechCrunch API returned 429/403 (slow down and retry later).
- `PARSE_ERROR` — API response could not be parsed as JSON.
- `DRIFT_DETECTED` — API response shape changed (expected a JSON array of posts).
