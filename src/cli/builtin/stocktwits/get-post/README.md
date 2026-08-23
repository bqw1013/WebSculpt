# stocktwits/get-post

Fetch a single Stocktwits post by numeric id — full text, publish time, sentiment tag, engagement counts, author, and mentioned symbols — optionally expanding its reply thread (discussion楼).

## Description

The command is the detail-resolution landing point for every Stocktwits list command: it takes a numeric post id (the `id` field of `get-symbol-posts` / `get-feed` / `get-user`, or the `messageId` field of `list-polls`) and returns the post's full body plus metadata. With `--include_replies true` it also fetches the reply thread with per-reply author, time, and like count, paginating internally (30 replies per API page) up to `--reply_limit`.

Both endpoints are the anonymous public JSON API (`api.stocktwits.com/api/2/`); no login, no API key, no browser needed. Each HTTP request is preceded by a random 200-700ms sleep and 429/403/network failures are retried with backoff (max 3 attempts).

### Known behavior: likeCount / replyCount are null on regular posts

The public API only exposes like and reply counts on **discussion/poll posts** (`discussion=true`, e.g. Stocktwits community polls). Regular posts have no `likes` field at all, so:

- `likeCount`: number on discussion posts, `null` on regular posts.
- `replyCount`: number on discussion posts (from the post's own `conversation.replies` field, which is a **stale/approximate** value — not the authoritative reply total), `null` on regular posts.

Do not treat `replyCount` as exact; the reply thread returned by `--include_replies` is the authoritative set.

## Parameters

| name | required | default | description |
|---|---|---|---|
| `id` | yes | — | Numeric post id (positive integer). From `get-symbol-posts` / `get-feed` / `get-user` `id`, or `list-polls` `messageId`. |
| `include_replies` | no | `false` | Set `true` to also fetch the reply thread. Only `true`/`false` accepted. |
| `reply_limit` | no | `20` | Max replies to return (1-100). Only effective when `include_replies=true`; `partial=true` when the thread runs deeper than this limit. |

CLI flags use underscores: `--id`, `--include_replies`, `--reply_limit`.

## Return Value

```jsonc
{
  "id": 200000001,                    // number
  "url": "https://stocktwits.com/example_user/message/200000001",  // constructed deeplink (no stable public permalink page exists)
  "body": "$AAPL example post body",
  "createdAt": "2026-08-20T13:37:09Z",
  "sentiment": "Bullish" | "Bearish" | null,
  "likeCount": 34 | null,             // only discussion/poll posts; null on regular posts
  "replyCount": 19 | null,            // stale approximate (discussion posts only); null on regular posts
  "discussion": false,                // whether this is a discussion/poll post
  "user": { "id": 2000000, "username": "example_user", "name": "Example User",
            "avatarUrl": "https://...", "followers": 232, "ideas": 19421 },
  "symbols": ["AAPL"],                // mentioned cashtags, $ stripped
  "partial": false,                   // true when include_replies=true and the thread was truncated at reply_limit
  "conversation": {                   // only when include_replies=true
    "parent": { "id": ..., "url": "...", "body": "...", "createdAt": "...", "user": {...} } | null,  // root OP when the id is a reply, else null
    "replies": [
      { "id": 200000002, "url": "...", "body": "...", "createdAt": "...",
        "sentiment": null, "likeCount": 7, "user": {"id":..., "username": "example_reply_user", "name": "Example Reply User",
        "avatarUrl": "...", "followers": 286, "ideas": 14993} }
    ],
    "more": false                    // whether deeper replies remain beyond what was returned
  }
}
```

Notes:

- `sentiment` comes from the post's `entities.sentiment.basic`: `Bullish`, `Bearish`, or `null`.
- `symbols` is the array of cashtag codes (e.g. `["AAPL"]`).
- `conversation.parent` is the root OP only when the target `id` is itself a reply; it is `null` when the target is a root post.
- Replies are returned oldest-first (ascending id order); `--reply_limit` caps how many are returned.
- The constructed `url` follows the confirmed format `https://stocktwits.com/{username}/message/{id}`; Stocktwits has no stable public permalink page (all tested `stocktwits.com/messages/{id}`-style URLs return 404), so treat it as a deeplink hint, not a guaranteed-open link.

## Usage

```
# Full text of a regular post
websculpt stocktwits get-post --id 662401099

# Full text + reply thread (default up to 20 replies)
websculpt stocktwits get-post --id 655544902 --include_replies true

# Limit the reply thread to 5 replies
websculpt stocktwits get-post --id 655544902 --include_replies true --reply_limit 5

# Fetch up to 100 replies (triggers multi-page cursor pagination)
websculpt stocktwits get-post --id 655544902 --include_replies true --reply_limit 100
```

The command output is JSON. Pass `-f human` (global flag) for a human-oriented rendering, or `-f json` to force JSON.

## Common Error Codes

| code | meaning |
|---|---|
| `MISSING_PARAM` | `id` was not provided. |
| `INVALID_PARAM` | `id` is not a positive integer; `include_replies` is not `true`/`false`; `reply_limit` is not an integer in 1-100. |
| `NOT_FOUND` | The post id does not exist (API returns HTTP 404 `Message not found`). |
| `RATE_LIMITED` | HTTP 429/403 persisted after 3 attempts with backoff. |
| `API_ERROR` | Unexpected non-2xx response, non-JSON body, or a response whose structure changed (missing `message` / `children.messages`). |
| `NETWORK_ERROR` | Connection failure or request timeout after 3 attempts. |
