# hackernews list-top

Fetch Hacker News top / best / new stories.

## Description

Fetch the specified story list via the official Hacker News Firebase API, returning structured data for each story including title, link, score, author, and comment count.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `type` | No | `top` | Story list type: `top` (trending), `best` (best), `new` (newest) |
| `limit` | No | `10` | Number of stories to return, range `1-30` |

## Returns

```json
{
  "type": "top",
  "limit": 10,
  "count": 10,
  "stories": [
    {
      "id": 47875795,
      "title": "Flipdiscs",
      "url": "https://flipdisc.io",
      "score": 222,
      "by": "skogstokig",
      "descendants": 42,
      "time": 1745678901
    }
  ]
}
```

- `type`: The actual list type queried
- `limit`: Requested upper bound
- `count`: Actual number of valid stories returned
- `stories`: Array of stories, ordered by HN ranking
  - `id`: HN story unique ID
  - `title`: Story title
  - `url`: Story link; points to HN discussion page if no external link (e.g., Ask HN)
  - `score`: Vote score
  - `by`: Submitter username
  - `descendants`: Number of comments
  - `time`: Unix timestamp (seconds)

## Usage

Get default top stories (first 10):

```bash
websculpt hackernews list-top
```

Get top 5 best stories:

```bash
websculpt hackernews list-top --type best --limit 5
```

Get top 20 newest stories:

```bash
websculpt hackernews list-top --type new --limit 20
```

## Common Error Codes

| Error Code | Scenario |
|------------|----------|
| `MISSING_PARAM` | `type` is not in the allowed set, or `limit` is not an integer between 1 and 30 |
| `EMPTY_RESULT` | API returned empty list, or all stories are invalid |
| `COMMAND_EXECUTION_ERROR` | Network error or HN API unreachable |
