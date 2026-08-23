# Context

## Precipitation Background (Why This Command Exists)

Video lists (`twitch/get-channel-videos`, `twitch/search --type video`) return only cards — title, duration, views, thumbnail — without full detail. Users who have a VOD URL or id need the complete record: title, owning channel, game/category, exact duration, view count, publish date, description, chapters, thumbnail. The `/videos/{id}` page's og meta is site-wide generic ("Twitch", "Twitch is the world's leading video platform...") and there is no embedded SSR state, so the data must come from Twitch's internal GraphQL. The command was precipitated after explore verified the two gql operations that provide every field.

## Value Assessment

- Complementary to the existing `twitch/search` (which only finds VODs, not their details) and to the planned `twitch/get-channel-videos` (list). Single-VOD detail is a frequent "click into a video" need.
- Reuses the same verified internal GraphQL path already proven in explore; saves re-deriving operation names/response shapes each time.
- Browser runtime reuses the user's Twitch session, so anonymous public data works and no API key is needed.

## Page Structure

- Page URL: `https://www.twitch.tv/videos/{videoId}` (SPA; canonical URL stays `/videos/{id}`, no redirect).
- Data source: `POST https://gql.twitch.tv/gql` with public web Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko`.
  - `VideoMetadata` (variables `{channelLogin, videoID}`) → `data.video` with id/title/description/previewThumbnailURL/createdAt/viewCount/publishedAt/lengthSeconds/broadcastType/owner{id,login,displayName}/game{id,slug,boxArtURL,name,displayName}.
  - `VideoPlayer_ChapterSelectButtonVideo` (variables `{includePrivate:false, videoID}`) → `data.video.moments.edges[].node` with description (title), positionMilliseconds (start).
- The page resolves the channel login internally before firing `VideoMetadata`, so the command only needs the video id.
- Rendered info container: `.channel-info-content` (DOM fallback; gql is the primary source).
- Nonexistent id: `.core-error` block with localized message + gql returns `video: null`.

## Environment Dependencies

- Browser runtime: WebSculpt daemon attaches to the user's Chrome/Edge via `connectOverCDP` (remote debugging must be enabled: `chrome://inspect/#remote-debugging`). The daemon connection is independent of any explore-stage `@playwright/cli` session.
- No login required for public VODs; login state (if any) does not change the public detail. Subscriber-only VODs may be inaccessible.
- Polite pacing: Twitch can throttle repeated rapid navigations. The command keeps a random 200-800ms delay before navigation; callers should space out invocations.
- Important: a fresh `page.goto` to `/videos/{id}` reliably triggers `VideoMetadata`, but a same-page `page.reload()` may be served from HTTP cache and skip it. Always navigate.

## Failure Signals

- `INVALID_PARAM`: url does not contain a `/videos/{digits}` segment and is not a bare numeric id.
- `NOT_FOUND`: `.core-error` present or `data.video === null` (nonexistent/deleted/unavailable video).
- `TIMEOUT`: neither `VideoMetadata` nor `.core-error` observed within the wait window — possible network throttling or page/network drift.
- `DRIFT_DETECTED` (conceptual): if Twitch renames the operations (`VideoMetadata`, `VideoPlayer_ChapterSelectButtonVideo`) or changes the response shape, the captured data will be empty; re-verify via explore.

## Repair Clues

- If `VideoMetadata` stops firing: re-check that the operation/variables are unchanged; fall back to reading `.channel-info-content` DOM for title/views/channel/game, and seek the chapters from the player chapter button.
- If the chapters operation changes: chapters may appear under a renamed moments connection; check the page's chapter selector button for the current operation name.
- The same gql endpoint works anonymously from node for the detail fields (verified), but `video.moments` (chapters) returns `server error` anonymously — the browser path is required for chapters.
