# Evidence: dailymotion/get-playlist

This document records the research and validation evidence for the `dailymotion/get-playlist` command.

## Exploration Path

- Library check: the only existing Dailymotion command is `dailymotion/search` (browser runtime), whose `playlist` result type returns playlist cards `{id, name, url, owner, videosTotal}`. There is no way to expand a single playlist's contents, so `get-playlist` is a new command.
- During explore, the Playwright CLI guide was read; a browser session (`<session>`) was used only to compare the public API result against the rendered website playlist page.
- Explore workspace was assessed `passed`; Confirmation recorded 2026-08-18 ("node runtime — 27 calls unlimited + API strictly ≥ website").
- Node runtime contract was read before writing `command.js`.

## Verified URLs

- https://api.dailymotion.com/playlist/xa5jms — playlist metadata (videos_total=1256, owner, thumbnail, created/updated, private)
- https://api.dailymotion.com/playlist/xa5jms/videos — video list (pagination, playlist order, limit max 100, 1000-item pagination cap)
- https://api.dailymotion.com/playlist/xd763u — small playlist (2 videos) metadata
- https://api.dailymotion.com/playlist/xd763u/videos — small playlist video list (has_more=false, order matches site)
- https://api.dailymotion.com/user/x1vy1cl/playlists — discovery entry point (user's playlists)
- https://api.dailymotion.com/playlists?fields=id,name,description&limit=50 — public playlist listing (description sample xd76i2)
- https://api.dailymotion.com/playlist/doesnotexist999 — 404 error shape
- https://www.dailymotion.com/playlist/xa5jms — website playlist page (sidebar order = API order, rotated to featured video)
- https://www.dailymotion.com/playlist/xd763u — website small playlist page (order matches API; page does not display description even when present)

## Structural Evidence

- Playlist metadata endpoint: `GET /playlist/{id}?fields=id,name,description,videos_total,thumbnail_720_url,created_time,updated_time,private,owner.id,owner.screenname,owner.username,owner.url`
  - Sample: `{"id":"<playlist-id>","name":"<playlist-name>","description":<description>,"videos_total":<videos-total>,"thumbnail_720_url":"<thumbnail-url>","created_time":<created-time>,"updated_time":<updated-time>,"private":<private>,"owner.id":"<owner-id>","owner.screenname":"<owner-screenname>","owner.username":"<owner-username>","owner.url":"<owner-url>"}`
  - Allowed playlist fields (from 400 error message) include `id,item_type,name,description,owner,private,videos_total,thumbnail_url,thumbnail_60..1080_url,created_time,updated_time` plus nested `owner.*`. There is NO `url`, `privacy`, `type`, or `modified_time` field for playlists.
  - `description` may be `null` or a string possibly containing HTML (`<br />`, `&amp;`); must be stripped to plain text.
- Video list endpoint: `GET /playlist/{id}/videos?fields=id,title,url,duration,thumbnail_url,created_time,views_total,owner.screenname,owner.username,owner.url&limit={n}&page={n}`
  - Response shape: `{page, limit, explicit, has_more, list:[{id,title,url,duration,thumbnail_url,created_time,views_total,"owner.screenname":...,"owner.username":...,"owner.url":...}]}`.
  - Dot-key fields `owner.screenname`, `owner.username`, `owner.url` are SINGLE string keys — must be accessed via bracket notation `v["owner.screenname"]`.
  - `limit` max is 100; `limit=200` returns 400 `Too high value 200, max allowed value is 100 for 'limit' parameter`.
  - Pagination cap: playlist video list serves at most 1000 items (page 10 with limit=100); page 11+ returns `{has_more:false, list:[]}` (empty, NOT an error).
  - Playlist order is the canonical API order; matches the website sidebar order (the site rotates the list to the featured/currently-playing video, e.g. xa5jms starts at xavpu22 which is position 4 in the API order; xd763u matches exactly).
  - Video sample: `{"id":"<video-id>","title":"<title>","url":"<video-url>","duration":<duration>,"thumbnail_url":"<thumbnail-url>","created_time":<created-time>,"views_total":<views>,"owner.screenname":"<owner-screenname>","owner.username":"<owner-username>","owner.url":"<owner-url>"}`.
- Error shape for missing playlist: HTTP 404 `{"error":{"code":404,"type":"not_found","message":"Can't find object collection for 'id' parameter","error_data":{"reason":"object_not_found","object_type":"collection"}}}` — both metadata and videos endpoints.
- Node runtime criteria (policy) both met:
  - ① No rate limiting: 8 consecutive fast calls + 5 spaced calls + 14 mixed-endpoint no-sleep stress calls = 27 calls, all HTTP 200, 0x429/403, no rate-limit headers in any response.
  - ② API info strictly ≥ website: the site's playlist page shows only name + owner + position counter; it does not display description (verified with xd763u which has one), does not show total count, and each video card shows only duration/title/owner/relative time. The API additionally provides description, videos_total, thumbnail, views_total, exact created_time, and owner url.

## Failure Signals

- HTTP 404 from either endpoint → playlist does not exist → NOT_FOUND.
- HTTP 400 with "Unrecognized value" in the message → API field renamed/removed → DRIFT_DETECTED.
- HTTP 400 with "Too high value ... for 'limit'" → internal pagination bug (should never happen with limit<=100).
- HTTP 429/403 → Dailymotion introduced rate limiting; surface RATE_LIMITED. The command sleeps a random 200-700ms before every HTTP request to avoid triggering this.
- Empty `list` with `has_more:false` before the requested limit is reached → partial=true (normal for short playlists or the 1000-item cap).
- Network errors / timeouts → propagate as COMMAND_EXECUTION_ERROR.

## Capture Assessment

- The path is verified, reproducible, and parameterizable (`url` + `limit`). The public API requires no login and no browser; both node runtime criteria were confirmed during explore (no rate limiting across 27 calls; API info strictly ≥ website). Capture as `dailymotion/get-playlist`.
