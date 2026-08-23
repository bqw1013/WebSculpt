# Evidence: vimeo/get-video

This document records the research and validation evidence for the `vimeo/get-video` command.

## Exploration Path

Command library check: the only existing Vimeo command is `vimeo/search` (browser runtime, intercepts `api.vimeo.com/search` responses). No `vimeo/get-video`-like command existed; this is a new capture.

Exploration was performed through the `websculpt-explore` skill (`<explore-workspace>`, assess passed 2026-08-18). Browser automation guide consulted. Playwright CLI session `<session>` was used to attach the browser and verify page structure, `__NEXT_DATA__` fields, the comments API, the video API, and the texttracks API against live pages.

## Verified URLs

- `https://vimeo.com/1188438376` — canonical video page; full `__NEXT_DATA__` verified (clip + clipMetadata.jsonLd + viewerBootstrap.jwt + seoTranscript).
- `https://vimeo.com/22439234` — high-comment video (2,804 comments); comment API pagination and sort (Newest/Oldest) verified.
- `https://vimeo.com/82632613` — comments-disabled video (`privacy.comments="nobody"`); page still renders a Comments header but the comments API returns `total: 0`.
- `https://vimeo.com/channels/staffpicks/1188438376` — channel-context URL; serves a legacy SSR page (no `__NEXT_DATA__`) with `<link rel="canonical" href="https://vimeo.com/1188438376">`; command must extract the trailing numeric ID.
- `https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1188438376` — anonymous oEmbed fallback; returns basic metadata only.
- `https://api.vimeo.com/videos/{id}?fields=stats.plays,metadata.connections.likes.total,...` — video API (requires `authorization: jwt <token>` header); authoritative live stats and user link.
- `https://api.vimeo.com/videos/{id}/comments?sort=date&direction=desc&page=1&per_page=25` — comments API (requires JWT); page pagination and `direction` sorting.
- `https://api.vimeo.com/videos/{id}/texttracks?include_transcript=true` — texttracks API (requires JWT); returns `data: []` when the video has no caption tracks.

## Structural Evidence

### Video page SSR data (`__NEXT_DATA__`)

`window.__NEXT_DATA__` (Next.js) is present on the canonical video page.

- `pageProps.clip` fields verified: `uri, name, descriptionHtml, link, duration, width, height, createdTime, contentRatingClass, privacy, pictures, metadata, user, page`.
- `privacy` sample: `{ "view": "anybody", "embed": "public", "download": false, "add": true, "comments": "anybody" }`.
- `clip.user` only carries `{ uri: "/users/3782420", name: "<uploader>", membership: { type: "business" }, pictures: { baseLink } }` — **no `link` field**; the public user URL must come from the video API (`user.link`) or oEmbed (`author_url`).
- `clip.metadata.connections` is an empty array (no likes/views there).
- `descriptionHtml` is HTML (`<p>` paragraphs); strip tags for plain text.
- `pictures.sizes` has 7 entries (100x75 up to 1920x1080), each with `link` and `linkWithPlayButton`.

### Stats (views / likes / comment count)

- `pageProps.clipMetadata.jsonLd` (a JSON string) contains `interactionStatistic` with `WatchAction` (views), `LikeAction` (likes), `CommentAction` (comments). Verified on `22439234` (WatchAction 78,957,654 / LikeAction 100,124, matching the page UI).
- **jsonLd is NOT reliable**: `82632613`'s jsonLd only has the author `FollowAction` and no video interactions.
- Authoritative source: video API `https://api.vimeo.com/videos/{id}?fields=stats.plays,metadata.connections.likes.total,metadata.connections.comments.total,user.link,user.name` with JWT header. Verified values:
  - `1188438376`: plays=83465, likes=272, comments=17, user.link=https://vimeo.com/thomasgibbons
  - `22439234`: plays=78957654, likes=100112, comments=2804, user.link=https://vimeo.com/terjes
  - `82632613`: plays=null (uploader hides play count), likes=213, comments=0

### Comments

- Comments API: `https://api.vimeo.com/videos/{id}/comments?sort=date&direction=desc&page=N&per_page=25&password=null` (+ `direction=asc` for oldest). `per_page` is adjustable. Verified page=2 returns 25 items; `paging.next/last` present (22439234 last = page 110).
- Sort dropdown on the page is a Chakra menu button "Newest"; open menu text is `Sort by:\n\nNewest\nOldest` → values map to API `direction=desc` (newest) / `direction=asc` (oldest).
- Comment object: `{ uri, text, created_on, last_edited_on, replies[], richtext, text_decorations, deleted_on, metadata.connections.user.{uri,name,pictures,link,badge,is_staff_picked}, metadata.connections.replies.total }`.
- Comment API `total` excludes deleted comments (e.g., 12 for 1188438376) whereas the video API `metadata.connections.comments.total` and the page UI show the higher count (17). Use the video API value for `commentCount`.

### Comments-disabled detection

- `clip.privacy.comments === "nobody"` is the reliable signal (verified on 82632613). The comments API still returns 200 with `{ total: 0, data: [] }`.

### Transcript / captions

- `pageProps.seoTranscript` exists; it is an empty object for non-captioned videos. For captioned videos it is expected to be a string (not yet verified live — see Capture Assessment).
- texttracks API `https://api.vimeo.com/videos/{id}/texttracks?include_transcript=true` (JWT) returns `{ total: 0, data: [] }` for videos without captions. When tracks exist, entries carry `{ id, language, name, type, link, uri }` with `type` expected to be `"captions"` and `link` a VTT URL.
- ~110 videos checked across queries/categories/On Demand/TEDx/recommendations: all had `total: 0` text tracks. Vimeo captions are uploader opt-in and rare.

### Channel-context URL

- `vimeo.com/channels/staffpicks/{id}` does NOT redirect (302) in the browser; it serves a legacy SSR page without `__NEXT_DATA__`, but declares `link[rel=canonical]` = `https://vimeo.com/{id}`. The command extracts the trailing numeric ID from the URL path and navigates to `https://vimeo.com/{id}`.

### oEmbed fallback

- `https://vimeo.com/api/oembed.json?url=...` is anonymously accessible from node (no Turnstile, no rate limit in 5 consecutive calls). Fields: `type, version, provider_name, provider_url, title, author_name, author_url, is_plus, account_type, html, width, height, duration, description, thumbnail_url, thumbnail_width, thumbnail_height, thumbnail_url_with_play_button, upload_date, video_id, uri`. Lacks views/likes/privacy/multi-picture/transcript/comments.

### Auth mechanism for api.vimeo.com

- Requests need header `Authorization: jwt <token>` plus `Content-Type: application/json` and `vimeo-page: /video/[clipId]`. The token is `pageProps.viewerBootstrap.jwt` (anonymous, `user_id: null`, ~256 chars). Plain `fetch` from node returns 401 `error_code 8003`.

## Failure Signals

- Node direct request to `vimeo.com/{id}` returns a Cloudflare Turnstile challenge shell (200, ~4.2KB, "Verify to continue", no `__NEXT_DATA__`) — persistent JS gate, not rate limiting. The command must run in a real browser.
- `vimeo.com/channels/staffpicks/{id}` (legacy page) has no `__NEXT_DATA__` — if the URL is not normalized to `vimeo.com/{id}`, extraction fails.
- Video page without a valid video: Vimeo returns a "VimeUhOh" / not-available page (no `__NEXT_DATA__.props.pageProps.clip`) — command should raise `NOT_FOUND`.
- `api.vimeo.com` returns 401 without the JWT header; if `viewerBootstrap.jwt` is missing, raise `AUTH_REQUIRED`.
- Non-captioned video: `seoTranscript` empty object and texttracks `total: 0` → `transcript: null`.
- `stats.plays` can be `null` when the uploader hides the play count.

## Capture Assessment

This command should be captured. `vimeo/search` and the planned listing commands only return video cards; the video page holds the full metadata (title, description, dimensions, upload time, privacy, thumbnails, uploader), exact stats, optional transcript, and the comment thread — the core content unit of Vimeo. The path was fully verified in explore (assess passed; user confirmed the contract 2026-08-18). One known gap: a live captioned-video sample could not be found (~110 videos checked, all without caption tracks); the `seoTranscript` structure for captioned videos must be re-verified during capture testing if a captioned video is located, otherwise the gap is recorded honestly (transcript returns `null` for the verified no-caption case).
