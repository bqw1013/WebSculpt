# instagram/search

## Description

Search Instagram in two modes:

- `type=media` (default): the media grid behind the keyword search page
  (`https://www.instagram.com/explore/search/keyword/?q=...`). Hashtag pages
  (`/explore/tags/{tag}/`) redirect to this keyword search, so a query with or
  without `#` browses that tag. Media results preserve every native
  `XDTMediaDict` field under `results[].native` and follow `after` cursors
  serially until the requested limit is reached.
- `type=accounts`: the search-box suggestion API
  (`/web/search/topsearch/?query=...`), returning the top matching accounts with
  username, display name, avatar, verification badge, and follower-count text.
  This API is a fixed top-5 suggestion list with no pagination (`count`,
  `max_id`, and `rank_token` do not change it).

## Parameters

- `query` (required): search text. For `type=media`, keywords or hashtags (with
  or without `#`). For `type=accounts`, a name or username fragment.
- `type` (optional, default `media`): `media` or `accounts`.
- `limit` (optional, default `20`): strict integer from 1 to 100. In `media`
  mode it drives cursor pagination; in `accounts` mode the API only ever
  returns its top suggestions (typically 5), so a `limit` above that is reported
  with `partial=true` rather than fabricating more rows.

## Return Value

### media

`{ query, type, maxLimit, results, resultCount, source, fallbackUsed, pagesFetched, partial, nativeEnvelope? }`

Each result is `{ kind: "media", native, id, pk, code, url, caption, user, mediaType, takenAt, imageVersions, videoVersions, metrics: { likeCount, commentCount, viewCount } }`.

The API path uses `source: "graphql"`; if it fails after re-navigation, a
partial visible-DOM result may be returned with `source: "dom"` and
`fallbackUsed: true`. `partial=true` means the requested limit could not be
reached (stream exhausted). If both paths fail, the command throws
`DRIFT_DETECTED`.

### accounts

`{ query, type, maxLimit, results, resultCount, source: "topsearch", hasMore, rankToken, partial }`

Each result is `{ kind: "account", pk, id, username, fullName, isVerified, isPrivate, profilePicUrl, socialContext }`.
`socialContext` is localized text (e.g. `"649 万 位粉丝"`); the API exposes no
numeric follower count. `partial=true` when the requested `limit` exceeds what
the fixed top-5 list returned.

## Usage

```
websculpt instagram search --query "ai" --limit 20
websculpt instagram search --query "#ai" --limit 10
websculpt instagram search --query "openai" --type accounts --limit 20
```

## Prerequisites

An existing logged-in Instagram browser session is required. The command does
not automate login and does not bypass CAPTCHA, 403, 429, or other challenges.
Rate limiting is mitigated with randomized waits (1.5-3s between requests;
0.5-1s between media pagination pages).

## Common Error Codes

- `MISSING_PARAM`: query is absent or empty.
- `INVALID_PARAM`: unsupported type or malformed limit.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `DRIFT_DETECTED`: the GraphQL/page-data path, the re-navigated DOM, or the
  topsearch API yielded no usable results.
