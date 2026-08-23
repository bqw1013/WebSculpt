# vimeo/get-user

Fetch a Vimeo creator's public profile header and one sub-page list, with internal pagination.

## Description

Returns the profile header fields (name, URL, avatar, bio, location when set, follower/following counts, video count, album/collection counts, member-since date, verified flag, website, membership) plus the items of one requested sub-page: videos (uploads), albums, collections, followers, or following. The `user` slug is the last path segment of the profile URL, e.g. `vimeo.com/<user-slug>` → `<user-slug>`.

The header data comes from the page's internal `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1` call, which requires the browser session (anonymous node requests get 401). Sub-page lists are parsed from the legacy SSR DOM (`ol.js-browse_list`) with path-style pagination `/{user}/{tab}/page:N`.

Public profiles need no login. Requires Chrome or Edge running with remote debugging enabled.

## Parameters

- `user` (required): User slug from the profile URL, e.g. `<user-slug>`. Discovery: click the uploader name on any Vimeo video page, or `vimeo/search --type people`.
- `tab` (optional, default `videos`): Sub-page to return — `videos` | `albums` | `collections` | `followers` | `following`. The header fields are always returned regardless of tab.
  - 中文对照：videos 作品 / albums 专辑 / collections 合集（聚合 Showcases+Channels，flatten 带 kind） / followers 粉丝 / following 关注。
  - Note: the public profile's "Showcases" tab maps to `/albums`.
- `limit` (optional, default 20): Maximum items to return for list tabs (1-100). Paginates internally; `partial=true` when the listing is exhausted.

## Return Value

```jsonc
{
  "user": {
    "name": "Example Creator (handle)",
    "url": "https://vimeo.com/examplecreator",
    "avatar": "https://i.vimeocdn.com/portrait/...",
    "bio": "Example bio ...",
    "location": "",
    "followerCount": 123,
    "followingCount": 12,
    "videoCount": 45,
    "albumCount": 2,
    "collectionCount": 3,
    "memberSince": "2020-01-01T00:00:00+00:00",
    "verified": false,
    "website": null,
    "membership": "basic"
  },
  "tab": "videos",
  "items": [
    { "id": "0000001", "title": "Example Video", "url": "/0000001", "thumbnail": "https://i.vimeocdn.com/video/...", "uploadDate": "2026-01-01T00:00:00-04:00" }
  ],
  "partial": false
}
```

`items` shape depends on `tab`:
- `videos`: `{ id, title, url, thumbnail, uploadDate }`
- `albums` / `collections`: `{ kind: "showcase"|"channel", id, name, url, thumbnail, videoCount, meta }` (meta e.g. "2 Videos / 13:32" or "19 Videos / 3 Followers")
- `followers` / `following`: `{ id, name, url, avatar, followedAt }`

## Usage

```
websculpt vimeo get-user --user <user-slug>
websculpt vimeo get-user --user <user-slug> --tab followers --limit 50
websculpt vimeo get-user --user <user-slug> --tab collections
```

## Common Error Codes

- `MISSING_PARAM` — `user` is required.
- `INVALID_PARAM` — `tab` not in the enum, `limit` not a positive integer, or `user` slug has invalid characters.
- `LIMIT_EXCEEDED` — `limit` > 100.
- `NOT_FOUND` — the user slug does not exist (HTTP 404).
- `DRIFT_DETECTED` — the header API did not respond as expected or the page structure changed.
