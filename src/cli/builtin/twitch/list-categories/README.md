# twitch/list-categories

List Twitch's top categories (games/topics) ranked by **live viewer count**, from Twitch's internal GraphQL — the ranking behind the Browse page's "Categories" tab. No login required; runs via Node (no browser).

## Description

Fetches the current hottest Twitch categories, ordered by live viewers high to low. Each result includes the category name, slug, genre tags, live viewer count, box art URL, and page URL. The `slug` is directly usable as `twitch/get-feed --category`. Returns the first page in a single request, up to `limit` (max 100).

## Parameters

| Parameter | Type   | Required | Default | Description |
|-----------|--------|----------|---------|-------------|
| `limit`   | number | no       | 20      | Maximum number of categories to return (1-100). Fetches the first page in one request; `partial: true` when fewer than `limit` are returned. |

Note: Twitch's `after`-cursor pagination triggers an integrity check, so this command intentionally does not paginate beyond the first page — one request covers the full `limit` range 1-100.

## Return Value

```text
Array<{
  id: string,          // category numeric ID
  name: string,        // English display name, e.g. "Just Chatting"
  slug: string,        // category slug, usable as twitch/get-feed --category and in /directory/category/{slug}/
  tags: string[],      // English genre tags, e.g. ["FPS","Shooter","RPG"]
  liveViewers: number, // live viewer count (raw number)
  boxArtUrl: string,   // box art URL at 285x380, e.g. https://static-cdn.jtvnw.net/ttv-boxart/509658-285x380.jpg
  url: string          // https://www.twitch.tv/directory/category/{slug}
}> + partial?: boolean // true when fewer results than requested are returned
```

Example (truncated fields):

```json
[
  {
    "id": "509658",
    "name": "Just Chatting",
    "slug": "just-chatting",
    "tags": ["IRL"],
    "liveViewers": 175816,
    "boxArtUrl": "https://static-cdn.jtvnw.net/ttv-boxart/509658-285x380.jpg",
    "url": "https://www.twitch.tv/directory/category/just-chatting"
  }
]
```

## Usage

```bash
# Default: top 20 categories
websculpt twitch list-categories

# Top 5 categories
websculpt twitch list-categories --limit 5

# Maximum: 100 categories (single request)
websculpt twitch list-categories --limit 100
```

## Common Error Codes

- `INVALID_LIMIT` — `limit` is not a positive integer (e.g. "abc", "-1", "1.5").
- `LIMIT_EXCEEDED` — `limit` exceeds the maximum of 100.
- `DRIFT_DETECTED` — the GraphQL request failed or the response structure changed (schema drift). Check Twitch for API changes.
