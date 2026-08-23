# Evidence: dailymotion/get-video

This document records the research and validation evidence for the `dailymotion/get-video` command.

## Exploration Path

Explored in a prior explore workspace (assess passed, user confirmed 2026-08-18, node runtime approved).

Library check: `websculpt command list dailymotion` shows only `dailymotion/search` (browser). `get-video` is a new command, no conflict.

Plan reference: command family plan get-video section. Plan's cited trace was lost; all findings re-verified live during explore.

Node runtime contract was consulted.

## Verified URLs

- https://api.dailymotion.com/video/xaxueoe?fields=id,title,description,duration,created_time,views_total,likes_total,tags,language,channel,thumbnail_url,owner.screenname,owner.username,owner.id — HTTP 200, full metadata.
- https://api.dailymotion.com/video/xayo29u?fields=... — HTTP 200, verified field coverage (owner.*, comments_total, status, allow_embed, private, etc.).
- https://api.dailymotion.com/video/xayo29u/comments?fields=id,message,created_time,owner.username,owner.screenname,owner.id&limit=100 — HTTP 200, empty pagination envelope (total:0). limit=100 accepted.
- https://api.dailymotion.com/video/xayo29u/subtitles?fields=language,url&limit=10 — HTTP 200, empty pagination envelope (total:0).
- https://geo.dailymotion.com/video/xayo29u.json?legacy=true&... — site's own player data source; duration/channel/created_time/title/language/tags match the public API.
- https://www.dailymotion.com/video/xayo29u — rendered video page (SPA); visible metadata (uploader, title, relative publish time, hashtags, expandable description) matches API. Page does NOT render views/likes/comments.
- https://www.dailymotion.com/video/x8tund6 — 7.7M-view video; page body scan `hasViewCount:false`, like-button has no count text, no comment UI.

## Structural Evidence

Public REST API (no auth, no rate-limit headers observed across 300+ requests):

- Video metadata: `GET https://api.dailymotion.com/video/{id}?fields={comma,separated,fields}` → HTTP 200.
  - Valid fields (probed): `id,title,description,duration,created_time,views_total,likes_total,tags,language,channel,thumbnail_url,comments_total,bookmarks_total,ratings_total,allow_embed,private,status,published,embed_url,views_last_hour,views_last_day,views_last_week,geoblocking,explicit,live_status,owner.id,owner.username,owner.screenname,owner.url,owner.avatar_120_url,owner.verified,owner.videos_total`.
  - Invalid fields (HTTP 400): `dislikes_total, owner.avatar_url, is_live, category, trailer, movie, tvshow, album, artist, playlist`.
  - `channel` is one of Dailymotion's 17 fixed topic slugs: animals, auto, people, fun, creation, school, videogames, kids, lifestyle, shortfilms, music, news, sport, tech, travel, tv, webcam (NOT the uploader).
  - `description` contains literal `<br />` HTML that must be stripped.
  - Invalid video ID → HTTP 404: `{"error":{"code":404,"message":"Can't find object video for `id' parameter","type":"not_found","error_data":{"reason":"object_not_found"}}}`.
  - Unknown field → HTTP 400 with `"error":{"code":400,...,"type":"invalid_parameter"}`.
  - `created_time` is a Unix epoch (seconds); convert to ISO 8601.
- Comments: `GET https://api.dailymotion.com/video/{id}/comments?fields=id,message,created_time,owner.username,owner.screenname,owner.id&limit={1..100}` → HTTP 200 pagination envelope `{"page":1,"limit":N,"explicit":false,"total":0,"has_more":false,"list":[]}`. Comment valid top-level fields: `id,item_type,created_time,message,owner,video,updated_time` (+ `owner.username/screenname/id`). `total` is the authoritative comment count; `partial` when total > requested limit.
- Subtitles: `GET https://api.dailymotion.com/video/{id}/subtitles?fields=language,url&limit={1..100}` → HTTP 200 envelope, `list:[{id,language,url,...}]`. Valid fields: `id,item_type,language,url`.

Sample video metadata (xaxueoe):
```json
{"id":"<id>","title":"<title>","description":"<description>","duration":<duration>,"created_time":<created-time>,"views_total":<views>,"likes_total":<likes>,"tags":<tags>,"language":"<language>","channel":"<channel>","thumbnail_url":"<thumbnail-url>","owner.screenname":"<owner-screenname>","owner.username":"<owner-username>","owner.id":"<owner-id>"}
```

Comments/subtitles are empty for the vast majority of videos (~300 probes across visited/recent/search results, all `total:0`). Empty list is the norm, NOT an error.

## Failure Signals

- HTTP 404 with `reason:"object_not_found"` → invalid video ID. Surface as `NOT_FOUND`.
- HTTP 400 `type:"invalid_parameter"` → invalid fields/params (should not happen with the fixed field list; if it does, signal drift).
- Missing `id` parameter → `MISSING_PARAM`.
- Private/unpublished videos: API may return 200 with `private:true`/`status:"blocked"` but empty owner or restricted data; pass through what the API returns.
- Rate limiting: none observed (no 429/403/JS challenge across 300+ requests including 40+ rapid-fire), but keep a 200-700ms random sleep before each HTTP request to stay polite and robust.
- Network failure → fetch throws; wrap with a clear `HTTP_ERROR`/`NETWORK_ERROR` code.
- `params.comment_limit` must be validated as integer 1..100 (regex-validate the raw string before parseInt to avoid truncation, per project convention).

## Capture Assessment

This command should be captured. It is a high-value, self-contained, parameterized path: fetch a single Dailymotion video's full metadata by URL/ID, with optional comments and subtitles. It reuses a stable public API (no login, no browser), is easily tested, and composes with the existing `dailymotion/search` command and future `dailymotion/get-user`. Node runtime satisfies both criteria: (1) no rate limiting observed under sustained fast calls; (2) API is a strict superset of the rendered video page (title/uploader/time/hashtags/description + views/likes/comments that the page does not even display).
