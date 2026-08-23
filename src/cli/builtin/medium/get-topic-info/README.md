# medium/get-topic-info

Fetch metadata and auxiliary views for a Medium topic.

## Description

`medium/get-topic-info` reads Medium's `/tag/<slug>` pages and their sub-views to return:

- `info` (default): topic metadata such as name, follower count, post count, and related topics.
- `who-to-follow`: authors and publications Medium recommends for the topic.
- `archive`: the chronological story stream for the topic.

This command complements `medium/get-topic-trending`, which returns the hot/recommended ranking.

## Parameters

- `--topic` (required): Topic slug, the last path segment of `https://medium.com/tag/<slug>`. Use `websculpt medium list-topics [--query <name>]` to discover slugs.
- `--section` (optional, default `info`): One of `info`, `who-to-follow`, `archive`.
- `--limit` (optional, default `20`): Maximum entries for `who-to-follow` and `archive`. Ignored for `info`. Valid range 1–100.

## Return Value

### `info`

```json
{
  "name": "Artificial Intelligence",
  "slug": "artificial-intelligence",
  "url": "https://medium.com/tag/artificial-intelligence",
  "followersCount": 9433537,
  "postCount": 501066,
  "parentTopic": { "name": "Technology", "slug": "technology" },
  "relatedTopics": ["Technology", "AI", "Machine Learning", "Programming", "Software Development"]
}
```

### `who-to-follow`

```json
{
  "topic": "artificial-intelligence",
  "section": "who-to-follow",
  "items": [
    {
      "type": "user",
      "name": "Example Author",
      "slug": "example-author",
      "bio": "Short bio text.",
      "followersCount": "12K followers",
      "url": "https://medium.com/@example-author"
    },
    {
      "type": "publication",
      "name": "Example Publication",
      "slug": "example-publication",
      "bio": "Publication description.",
      "followersCount": "215K followers",
      "url": "https://medium.com/example-publication"
    }
  ],
  "count": 20,
  "totalAvailable": 100
}
```

`followersCount` is a string (e.g. "12K followers") when the page renders it, otherwise `null`.

### `archive`

```json
{
  "topic": "artificial-intelligence",
  "section": "archive",
  "articles": [...],
  "count": 20,
  "requestedLimit": 30,
  "partial": true
}
```

Each article contains `title`, `subtitle`, `url`, `author`, `publication`, `publishedAt`, `clapCount`, `responseCount`, `readingTimeMinutes`, `previewImageUrl`, and `isMemberOnly`. `partial: true` means the stream ended before the requested limit was reached.

## Usage

```bash
websculpt medium get-topic-info --topic artificial-intelligence
websculpt medium get-topic-info --topic artificial-intelligence --section who-to-follow --limit 50
websculpt medium get-topic-info --topic artificial-intelligence --section archive --limit 100
```

## Common Error Codes

- `MISSING_PARAM`: `--topic` is missing or empty.
- `INVALID_PARAM`: `--section` is not one of the allowed values, or `--limit` is outside 1–100.
- `NOT_FOUND`: The topic slug does not exist (404 page).
- `PAGE_LOAD_FAILED`: The page did not hydrate within timeout.
- `DRIFT_DETECTED`: Expected Apollo cache structure was not found; Medium may have changed the page.
- `EMPTY_RESULT`: The list/archive is empty.
