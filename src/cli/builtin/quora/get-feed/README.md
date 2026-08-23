# quora/get-feed

Fetch the Quora homepage or following feed as a structured list of answers, questions, and Space posts.

## Description

`quora/get-feed` returns the mixed content stream from Quora's home page (`tab=home`) or following page (`tab=following`). Each item is tagged with its type so callers can distinguish answers, questions, and posts.

The command first tries Quora's `MultifeedQuery` GraphQL endpoint for the home feed. If the GraphQL path fails or for the following feed, it falls back to visible DOM selectors.

## Parameters

- `--tab` — `home` (default) or `following`.
- `--limit` — Maximum items to return, integer `1-100` (default `20`).

## Return Value

```json
{
  "tab": "home",
  "limit": 20,
  "items": [
    {
      "type": "answer",
      "id": "...",
      "url": "https://www.quora.com/...",
      "title": "Question title",
      "excerpt": "Answer excerpt...",
      "author": { "name": "...", "profileUrl": "..." },
      "source": null,
      "publishedAt": 1784937793913102,
      "upvoteCount": 120,
      "commentCount": 12,
      "question": { "qid": 123, "title": "...", "url": "..." }
    }
  ],
  "itemCount": 20,
  "partial": false,
  "pagesFetched": 3,
  "source": "api",
  "fallbackUsed": false,
  "fallbackReason": null
}
```

## Usage

```bash
websculpt quora get-feed
websculpt quora get-feed --tab home --limit 10
websculpt quora get-feed --tab following --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — `tab` or `limit` is out of range.
- `AUTH_REQUIRED` — No logged-in Quora session was detected.
- `EMPTY_RESULT` — No feed items could be extracted.
- `DRIFT_DETECTED` — Quora returned a challenge (CAPTCHA/rate limit) or the expected structure is missing.
