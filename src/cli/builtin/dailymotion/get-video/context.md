# Context

## Precipitation Background (Why This Command Exists)

Dailymotion had no `get-video` command. The command family plan designated `get-video` as a node-runtime command because the public REST API `api.dailymotion.com` covers the website video page's visible metadata and adds views/likes/comments/subtitles the page does not even render. User confirmed the contract and node runtime on 2026-08-18; explore assess passed.

## Value Assessment

Fetching a single video's full metadata by URL/ID is a recurring need (deep-dive after `dailymotion/search`, or following any video link). It replaces a SPA page that is impossible to scrape statically (no JSON-LD, no initial state, title is just "Dailymotion"). The public API is stable, auth-free, and the returned uploader ID composes with `dailymotion/get-user`. Node runtime keeps it fast and dependency-free.

## Page Structure

No DOM is used. Verified API endpoints (explore-tested, all HTTP 200):

- Video metadata: `GET https://api.dailymotion.com/video/{id}?fields={comma,separated}`
  - Fields used: `id,title,description,duration,created_time,views_total,likes_total,tags,language,channel,thumbnail_url,owner.id,owner.username,owner.screenname,owner.url`
  - `description` contains literal `<br />` HTML; strip it.
  - `channel` is a topic slug (17 fixed values: animals, auto, people, fun, creation, school, videogames, kids, lifestyle, shortfilms, music, news, sport, tech, travel, tv, webcam), NOT the uploader.
  - `created_time` is a Unix epoch in seconds.
  - API flattens nested fields into dotted keys (`owner.screenname`).
- Comments: `GET https://api.dailymotion.com/video/{id}/comments?fields=id,message,created_time,owner.username,owner.screenname,owner.id&limit={1..100}`
  - Response envelope `{ page, limit, total, has_more, list: [] }`. `total` is the authoritative count; `partial:true` when `total > limit`.
- Subtitles: `GET https://api.dailymotion.com/video/{id}/subtitles?fields=language,url&limit=100`
  - Response envelope; each item has `language` and `url`.

## Environment Dependencies

- Public Dailymotion API only — no login, no browser, no API key.
- Polite pacing: random 200-700ms sleep before every HTTP request (enforced in `command.js`). Rate limiting was NOT observed in explore (300+ requests incl. 40+ fast sequential calls all HTTP 200, no 429/403/JS challenge), but the sleep keeps the command robust and polite.
- 20s request timeout via AbortController.

## Failure Signals

- HTTP 404 `reason: "object_not_found"` → `NOT_FOUND` (bad video ID). Surfaced from `fetchJson`.
- HTTP 400 `type: "invalid_parameter"` → `DRIFT_DETECTED` (Dailymotion changed field names / API contract). Check `VIDEO_FIELDS`/`COMMENT_FIELDS` against the current allowed-field list.
- `description` may come back `null`; `stripHtml` handles it.
- Comments/subtitles empty for the vast majority of videos (~300 probes in explore, all `total:0`) — an empty array is the norm, not an error. Do NOT treat it as `EMPTY_RESULT`.

## Repair Clues

- If `DRIFT_DETECTED` appears, probe a valid video with an intentionally invalid field to trigger the API's 400 "allowed values are (...)" message (note: that error list is truncated server-side; test candidate fields individually).
- If API returns 429/403 in the future, reduce concurrency and increase the sleep window; revisit whether node runtime still qualifies.
- Backup entry point: the site's own `https://geo.dailymotion.com/video/{id}.json?legacy=true&...` returns the same title/duration/channel/created_time, and `POST https://api.dailymotion.com/v1/graphql` returns richer page metadata — either could substitute if the REST `/video/{id}` endpoint changes shape.
