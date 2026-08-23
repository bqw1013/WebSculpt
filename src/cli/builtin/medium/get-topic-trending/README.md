# medium/get-topic-trending

Fetch trending articles for a Medium topic. Reads the topic's recommended stream at `https://medium.com/tag/<slug>/recommended`, lazy-loads more articles by scrolling, and returns structured metadata for each article.

## Description

Visits the `/tag/<slug>/recommended` page for the requested topic and extracts the recommended posts feed from the live Apollo Client cache. Each article includes engagement metrics, author information, publication (when applicable), tags, and preview image. If the stream runs out before the requested `limit` is reached, the command returns the articles it could collect with `partial: true`.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `topic` | string | **yes** | — | Topic slug, e.g. `artificial-intelligence`, `programming`, `technology`, `machine-learning`. |
| `limit` | number | no | 20 | Number of articles to return (1–100). The stream lazy-loads; the command scrolls until the limit is reached or the stream is exhausted. |

## Return Value

```json
{
  "topic": {
    "slug": "artificial-intelligence",
    "displayTitle": "Artificial Intelligence"
  },
  "items": [
    {
      "rank": 1,
      "title": "Example Article Title",
      "subtitle": "Example subtitle text.",
      "url": "https://medium.com/@example-author/example-article",
      "author": {
        "name": "Example Author",
        "username": "example-author",
        "url": "https://medium.com/@example-author"
      },
      "publication": {
        "name": "Example Publication",
        "slug": "example-publication",
        "url": "https://example-publication.net"
      },
      "clapCount": 44,
      "responseCount": 0,
      "readingTimeMinutes": 17,
      "publishedAt": "2026-06-03T12:34:22.274Z",
      "latestPublishedAt": "2026-06-03T12:34:22.274Z",
      "tags": ["Artificial Intelligence", "Machine Learning"],
      "previewImage": "https://miro.medium.com/v2/1*example.png",
      "isLocked": false,
      "isMemberOnly": false
    }
  ],
  "count": 20,
  "requestedLimit": 20,
  "partial": false
}
```

## Usage

```bash
# Fetch trending articles for the AI topic
websculpt medium get-topic-trending --topic artificial-intelligence

# Fetch top 5 articles for the programming topic
websculpt medium get-topic-trending --topic programming --limit 5

# Fetch up to 100 articles for the technology topic
websculpt medium get-topic-trending --topic technology --limit 100
```

## Common Error Codes

| Code | Description |
|------|-------------|
| `MISSING_PARAM` | Required parameter `topic` is missing or empty |
| `INVALID_PARAM` | `limit` is not an integer or outside 1–100 |
| `TAG_NOT_FOUND` | The requested topic does not exist |
| `PAGE_LOAD_FAILED` | Apollo cache did not hydrate within the timeout |
| `DRIFT_DETECTED` | Expected Apollo cache structure is missing |
| `EMPTY_RESULT` | No valid articles were extracted |
