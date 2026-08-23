# Context

## Precipitation Background (Why This Command Exists)

Vimeo listing commands (`vimeo/search`, planned `get-category`/`get-channel`/`get-trending`/`get-user`) only return video cards. The video watch page `vimeo.com/{id}` holds the full metadata (title, description, duration, dimensions, upload time, privacy, thumbnails, uploader), exact views/likes, an optional transcript, and the comment thread — the core content unit of Vimeo. This command captures that page plus the site's own authenticated API endpoints.

## Value Assessment

High reuse value: every video card from any Vimeo list command is a candidate input (just pass its URL). Single command returns complete metadata + optional transcript + comments, saving a full manual page inspection per video. Browser runtime is mandatory (the video page is gated behind Cloudflare Turnstile for plain HTTP clients, and `api.vimeo.com` requires a session JWT), so reuse of the user's browser session is the reliable path.

## Page Structure

- Canonical video page: `https://vimeo.com/{id}` (Next.js). Data lives in `window.__NEXT_DATA__`:
  - `props.pageProps.clip` — base metadata (uri/name/descriptionHtml/link/duration/width/height/createdTime/contentRatingClass/privacy/pictures/user).
  - `props.pageProps.clipMetadata.jsonLd` — JSON string with `keywords` (tags) and (unreliably) `interactionStatistic`.
  - `props.pageProps.viewerBootstrap.jwt` — anonymous JWT used as `Authorization: jwt <token>` on api.vimeo.com.
  - `props.pageProps.seoTranscript` — transcript text (string) when the video has captions; empty object otherwise.
- `clip.privacy.comments === "nobody"` means comments are disabled.
- Channel-context URL `vimeo.com/channels/{name}/{id}` serves a legacy SSR page (no `__NEXT_DATA__`) with `<link rel="canonical">` pointing at `vimeo.com/{id}`; extract the trailing numeric ID and navigate to the canonical URL.
- Video API (JWT): `api.vimeo.com/videos/{id}?fields=stats.plays,metadata.connections.likes.total,metadata.connections.comments.total,user.link,user.name` → authoritative live stats + user link.
- Comments API (JWT): `api.vimeo.com/videos/{id}/comments?sort=date&direction=desc|asc&page=N&per_page=25&password=null` → paginated thread; `paging.next` drives pagination.
- Texttracks API (JWT): `api.vimeo.com/videos/{id}/texttracks?include_transcript=true` → caption track list (`data: []` when no captions).
- oEmbed fallback: `https://vimeo.com/api/oembed.json?url=...` (anonymous, basic metadata only).

## Environment Dependencies

- Chrome/Edge running with remote debugging enabled (WebSculpt browser session). Public videos need no login.
- Requests to `api.vimeo.com` must carry headers `Authorization: jwt <token>`, `Content-Type: application/json`, `vimeo-page: /video/[clipId]`; without the JWT the API returns 401 `error_code 8003`.
- Polite pacing: the command does a light random scroll + mouse-move after page load and a short random wait between comment page fetches. Keep it gentle; the site challenges plain HTTP clients (Turnstile) but tolerates real browser sessions at moderate frequency.

## Failure Signals

- Node/plain HTTP to `vimeo.com/{id}` returns a Cloudflare Turnstile challenge shell (200, ~4.2KB, "Verify to continue", no `__NEXT_DATA__`).
- `vimeo.com/channels/...` and `vimeo.com/{user}/{slug}` pages have no `__NEXT_DATA__` — never navigate to those; normalize to `vimeo.com/{id}` first.
- Custom-slug video URLs (`vimeo.com/{user}/{slug}`, e.g. `vimeo.com/terjes/themountain`) are NOT resolved: `extractVideoId` requires a trailing numeric ID and raises `INVALID_PARAM`. This is a documented limitation (slug resolution would need an extra legacy-page navigation).
- On Demand / live / other non-standard pages may never embed `__NEXT_DATA__` → `DRIFT_DETECTED` (the `waitForSelector` timeout is swallowed so the clearer error surfaces).
- Unavailable/private video: `__NEXT_DATA__` present but `pageProps.clip` missing/empty → `NOT_FOUND`.
- `__NEXT_DATA__` missing entirely → `DRIFT_DETECTED`.
- `stats.plays` is `null` when the uploader hides the play count (normal, not an error).
- Comment thread with comments off: `privacy.comments="nobody"` and comments API returns `{total: 0, data: []}`.
- Comments API `total` excludes deleted comments, so it can be lower than `stats.commentCount` (which comes from `metadata.connections.comments.total` and matches the page UI).

## Repair Clues

- If `__NEXT_DATA__` shape changes, re-verify against a live video page and update the field paths in `command.js`.
- If api.vimeo.com starts rejecting the JWT, re-check `viewerBootstrap.jwt` usage (it is regenerated per page load; always read it fresh from the current page).
- If the comments API response shape changes, re-check `paging.next` / `data[]` / `metadata.connections.user`.
- oEmbed (`api/oembed.json`) is the fallback entry point for basic metadata (title/author/duration/description/thumbnail) if the video page extraction ever breaks.
- **Transcript gap (known)**: `transcript` is read from `pageProps.seoTranscript` (string when present, else null). During explore ~110 public videos and capture candidate IDs (453355865, 214953675, 371272611, 400410839, 400410893, 403052537, 354543081, 1195836424) all had no public captions (`texttracks` total 0 / transcript null). Vimeo captions are uploader opt-in and rare on public videos. When a captioned public video is found, re-verify that `seoTranscript` is the plain-text transcript; the command currently surfaces `null` for the verified no-caption case and would surface a non-empty string if one is present.
