# hackernews/search

Search HackerNews via the public Algolia API (`hn.algolia.com`). No API key, no login, no browser.

## Description

Searches HackerNews content by keyword and returns structured results. Supports four content types (stories, comments, Ask HN, Show HN), relevance or latest-date sorting, and time range filtering. Requests above the platform maxLimit of 1000 (Algolia pagination window) are rejected with an error.

## Parameters

| Name | Required | Default | Description |
|---|---|---|---|
| `query` | yes | — | Search keyword. |
| `limit` | no | `20` | Number of results, max 1000. Above 1000 → `LIMIT_EXCEEDED`. |
| `type` | no | `story` | Content type: `story` / `comment` / `ask_hn` / `show_hn`. |
| `sort` | no | `default` | `default` (relevance, points-weighted) or `latest` (newest first). `popular` is not supported by the API: it is ignored, falls back to relevance, and is flagged in `ignoredParams`. |
| `time` | no | `all` | Time range: `day` / `week` / `month` / `year` / `all`. Mapped to `numericFilters=created_at_i>{threshold}`. |

## Return Value

```json
{
  "results": [
    {
      "objectID": "22238335",
      "type": "story",
      "title": "Why Discord is switching from Go to Rust",
      "url": "https://blog.discordapp.com/...",
      "contentUrl": "https://news.ycombinator.com/item?id=22238335",
      "author": "Sikul",
      "authorUrl": "https://news.ycombinator.com/user?id=Sikul",
      "publishedAt": "2020-02-04T16:41:39.000Z",
      "createdAtI": 1580834499,
      "metrics": { "points": 1408, "comments": 605 },
      "text": null,
      "parentId": null,
      "storyId": null,
      "storyTitle": null,
      "storyUrl": null,
      "children": [22238816],
      "tags": ["story", "author_Sikul", "story_22238335"],
      "highlight": {},
      "updatedAt": "..."
    }
  ],
  "count": 20,
  "nbHits": 59159,
  "query": "rust",
  "type": "story",
  "sort": "default",
  "time": "all"
}
```

- Missing fields are `null`, not omitted. Field availability varies by `type`: comments have no `title`/`url`/`metrics.comments` but carry `text` (comment body), `parentId`, `storyId`, `storyTitle`, `storyUrl`; `ask_hn` carries `text` (self-post body) and no external `url`.
- `ignoredParams: ["sort"]` is present when an unsupported sort (`popular`) was passed.

## Usage

```
websculpt hackernews search --query "rust"
websculpt hackernews search --query "ai" --sort latest --time week --limit 50
websculpt hackernews search --query "postgres" --type comment --limit 10
```

## Common Error Codes

- `MISSING_PARAM` — `query` missing or empty.
- `INVALID_PARAM` — `limit` not a positive integer, or `type` / `sort` / `time` value outside the allowed enums.
- `LIMIT_EXCEEDED` — `limit` above maxLimit 1000 (Algolia pagination window).
- `UPSTREAM_ERROR` — network failure or non-200 from `hn.algolia.com`.
- `DRIFT_DETECTED` — response missing the top-level `hits` array; API schema may have changed.
