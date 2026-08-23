# techcrunch/get-topic

## Description

Fetch the article stream under a TechCrunch topic/company tag — the same list shown on tag pages like `techcrunch.com/tag/apple/`. Tags are TechCrunch's free-form labels (mostly company, people, and product names), distinct from the 23 fixed editorial categories in `techcrunch/get-feed`. Returns the tag's total article count plus newest-first article cards. Powered by the public WordPress REST API; no authentication or browser required.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `topic` | yes | - | Tag slug as it appears in tag page URLs: `techcrunch.com/tag/{slug}/` (e.g. `apple`, `openai`, `cloud-computing`). Lowercase, words joined with hyphens. Discovery: open any article and check its tag links, or use the `tags` array from `techcrunch/get-article`. |
| `limit` | no | 20 | Maximum number of articles to return (1-100). Paginates internally; `partial: true` when the tag stream is exhausted. |

## Return Value

```json
{
  "topic": { "slug": "apple", "name": "Apple", "articleCount": 12550 },
  "articles": [
    {
      "title": "…",
      "url": "https://techcrunch.com/2026/08/13/…/",
      "date": "2026-08-13T14:50:11",
      "excerpt": "…",
      "image": "https://techcrunch.com/wp-content/uploads/…jpg",
      "categories": ["Security"]
    }
  ],
  "partial": true
}
```

- `topic.articleCount` is the tag's total article count from the tags API (the canonical number shown on the tag page). The posts stream may report a slightly lower total (`X-WP-Total`) because a handful of non-public posts are counted by the tag but not returned by the public posts endpoint.
- `articles` is newest-first, matching the tag page order (browser-verified).
- `partial` is present and `true` only when fewer than `limit` articles exist (stream exhausted).

## Usage

```
websculpt techcrunch get-topic --topic apple
websculpt techcrunch get-topic --topic openai --limit 50
websculpt techcrunch get-topic --topic cloud-computing --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — `--topic` omitted or empty.
- `INVALID_PARAM` — `topic` contains spaces, or `limit` is not an integer in 1-100.
- `NOT_FOUND` — the tag slug does not exist.
- `RATE_LIMITED` — HTTP 429 from the API.
- `API_ERROR` — API returned a non-2xx status.
- `NETWORK_ERROR` — request failed or timed out.
- `DRIFT_DETECTED` — API response shape changed (no longer an array).
