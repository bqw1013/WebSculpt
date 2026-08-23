# quora/get-question

Fetch a single Quora question page: title, topics, answer count, and a list of answer preview cards. Answers are returned as excerpts; use `quora/get-answer` on an answer URL to retrieve the full text and comments.

## Description

This command navigates to a Quora question page (`https://www.quora.com/<slug>`), extracts the question metadata and answer cards, optionally returns the "All related" related-questions section, and stops when the requested limit is reached or the answer stream is exhausted.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--url` | yes | - | Full question URL or just the slug. |
| `--limit` | no | 20 | Maximum answer cards to return (1-100). |
| `--sort` | no | `recommended` | Ordering: `recommended` or `recent`. |
| `--include_related` | no | `false` | Also return the "All related" question list. |

## Return Value

```json
{
  "question": {
    "title": "string",
    "url": "string",
    "topics": [{ "name": "string", "slug": "string", "url": "string" }],
    "answerCount": "number?",
    "followerCount": "number?"
  },
  "answers": [
    {
      "author": { "name": "string", "profileUrl": "string", "credential": "string?" },
      "url": "string",
      "publishedAt": "string",
      "upvoteCount": "number?",
      "commentCount": "number?",
      "excerpt": "string",
      "isTruncated": "boolean",
      "isMergedSource": "boolean?",
      "mergedFromQuestion": { "title": "string?", "url": "string?" }
    }
  ],
  "related": [{ "title": "string", "url": "string", "answerCount": "number?" }],
  "partial": "boolean?"
}
```

- `partial=true` means the stream ended before `--limit` was satisfied.
- `followerCount` is usually `null` because Quora does not expose it on the question page.

## Usage

```bash
websculpt quora get-question --url "How-do-I-write-a-diary-entry-from-a-characters-point-of-view"
websculpt quora get-question --url "https://www.quora.com/How-do-I-write-a-diary-entry-from-a-characters-point-of-view" --sort recent --limit 10 --include_related true
```

## Common Error Codes

- `MISSING_PARAM`: `--url` is empty.
- `INVALID_PARAM`: `--limit` or `--sort` is out of range.
- `NOT_FOUND`: Quora returned a 404 page.
- `AUTH_REQUIRED`: Login wall detected.
- `DRIFT_DETECTED`: Expected page structure not found.
