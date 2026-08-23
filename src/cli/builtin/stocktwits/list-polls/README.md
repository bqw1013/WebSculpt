# stocktwits/list-polls

## Description

List Stocktwits' community polls — the content on `stocktwits.com/discussions`. Each poll carries its question text, description, related symbols (cash tags), total vote count, start/expiry times, per-choice percentages, and reply count.

The page is **Next.js SSR**: a fixed **50 polls**, newest-first, mixing `active` and `ended` states, are embedded in the HTML (`__NEXT_DATA__`). There is **no pagination** — a `--limit` above what the page actually contains is silently truncated and `partial: true` is set.

Every poll has a `messageId` (the underlying discussion message id): pass it to `stocktwits/get-post` (optionally with `--include-replies`) to read the poll's discussion thread. Anonymous public SSR — **no login, no browser needed**. Runtime: `node`.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `limit` | no | `20` | Maximum polls to return (positive integer; 1-50 is meaningful). The page embeds a fixed 50 polls with no pagination, so values above the available count are silently truncated and `partial: true` is set. |

## Return Value

An object `{ polls, partial }`:

```json
{
  "polls": [
    {
      "id": 70001,
      "status": "active",
      "question": "Example poll question about a symbol ($WMT)?",
      "description": "Example description text for the poll.",
      "totalVotes": 100,
      "startsAt": "2026-08-20T13:02:00Z",
      "expiresAt": "2026-08-21T13:00:00Z",
      "createdAt": "2026-08-20T13:05:29Z",
      "symbols": ["WMT", "BABA", "TGT"],
      "messageId": 70000001,
      "discussionUrl": "https://stocktwits.com/discussions/example-poll-slug/70000001",
      "commentsCount": 4,
      "choices": [
        { "title": "Yes", "percent": 63 },
        { "title": "No", "percent": 14 }
      ]
    }
  ],
  "partial": false
}
```

Field notes:

- `status`: `"active"` | `"ended"` — the list mixes both, newest-first; the field reflects the live state verbatim.
- `symbols`: cash-tag codes pulled from the poll's `associations` (`type: "stock"`); feed them to `stocktwits/get-symbol-overview` / `get-symbol-posts`.
- `messageId`: the discussion message id — the input to `stocktwits/get-post`.
- `discussionUrl`: the canonical discussion permalink `https://stocktwits.com/discussions/{slug}/{messageId}`.
- `choices`: option title + vote share percent (0-100).
- `partial`: `true` only when the requested `--limit` exceeds the number of polls the page embedded (e.g. `--limit 100` on a 50-poll page). With the default `--limit 20` it is `false`.

## Usage

```
websculpt stocktwits list-polls
websculpt stocktwits list-polls --limit 50
websculpt stocktwits list-polls --limit 3
websculpt stocktwits list-polls --limit 100
```

## Common Error Codes

| code | meaning |
|------|---------|
| `INVALID_PARAM` | `limit` is not a positive integer (e.g. `0`, `-1`, `abc`). |
| `RATE_LIMITED` | Stocktwits returned 429/403 (rate limiting) after backoff retries. |
| `NOT_FOUND` | `/discussions` persistently returned HTTP 404 — the URL may have moved. |
| `DRIFT_DETECTED` | The SSR structure changed: `__NEXT_DATA__` block or `polls` array is missing. |
| `EMPTY_RESULT` | The page returned no polls. |
| `API_ERROR` | Unexpected HTTP status / truncated body / fetch failure after retries. |
| `NETWORK_ERROR` | Fetch failed / timed out / network unreachable (after retries). |
