# Context

## Precipitation Background (Why This Command Exists)

YouTube playlists (≈ Bilibili 收藏夹/合集) are a standard way creators organize series content. `youtube/get-feed` and `youtube/search` only return single video cards; there was no command to enumerate the contents of a playlist. The platform command plan defined this command. Explore phase verified the `/playlist?list={id}` page path on three public playlists and two personal lists, and the audit passed on 2026-08-14.

## Value Assessment

- Reuse frequency: high for tracking creator series, course/category collections, and for chaining into `youtube/get-video`.
- Generality: url accepts full playlist URL or bare list ID (PL/UU/WL/LL), so it covers every playlist entry point.
- Time saved: without this command, enumerating a playlist means manually scrolling and scraping — this command returns structured items with metadata in one call.
- Chainable output: `items[].videoId`/`items[].url` → `youtube/get-video`; `playlist.channel.url` → `youtube/channel-info`.

## Page Structure

- Navigate: `https://www.youtube.com/playlist?list={id}`; call `page.bringToFront()` right after navigation (the daemon's page is a background tab; without it YouTube's lazy loading/scroll is throttled and neither `window.scrollBy` nor scrolling fires any load).
- Primary data: `window.ytInitialData` (covers up to 100 extractable videos in one batch).
  - Header new layout: `header.pageHeaderRenderer.content.pageHeaderViewModel` → `title.dynamicTextViewModel.text.content`, `metadata.contentMetadataViewModel.metadataRows` (row 0 = channel avatar/text + browseEndpoint, row 1 = stats incl. "N 个视频").
  - Header classic layout (WL/LL): `header.playlistHeaderRenderer` → `title.simpleText`, `ownerText`, `ownerEndpoint.browseEndpoint`, `stats`, `numVideosText`, `privacy`.
  - Items: `contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[*].lockupViewModel` → `contentId`, `contentType === "LOCKUP_CONTENT_TYPE_VIDEO"`, `metadata.lockupMetadataViewModel.title`, `metadata.metadata.contentMetadataViewModel.metadataRows` (row 0 = channel), `contentImage.thumbnailViewModel.overlays[].thumbnailBottomOverlayViewModel.badges[].thumbnailBadgeViewModel.text` (duration).
  - Continuation trigger exists at `sectionListRenderer.contents[1].continuationItemViewModel.continuationCommand.innertubeCommand.continuationCommand.token` but a direct fetch of it returns a recommended-playlist `horizontalShelfViewModel`, not additional videos; `POST /youtubei/v1/next` returns a watch-page recommendation panel. The scroll fallback is therefore a best-effort safety net that extracts newly appended DOM `yt-lockup-view-model` items and filters out recommended-playlist lockups (identified by a `content-id-PL...` host class). It stops as soon as a scroll round adds no real videos.
- DOM fallback: `yt-lockup-view-model` elements; videoId from `a[href*="/watch?v="]`, duration from the time-status badge or a `m:ss` pattern, title from the title anchor, channel from a `/@` or `/channel/` anchor.

## Environment Dependencies

- Browser runtime: attach to user's Chrome/Edge with remote debugging enabled. Login not required for public playlists.
- WL/LL and private playlists need a logged-in session; verified in a logged-in session where WL and LL were both empty ("此播放列表中尚无视频").
- Polite pacing: random waits after navigation, a single gentle random pointer move, random waits between continuation fetches; no write operations, no button clicks. Consecutive invocations keep a human-like cadence.
- Note: the page header `videoCount` (e.g. "58 个视频") can exceed the number of extractable items (52) because the official count includes unavailable/private videos. The command returns the actually-extracted items and uses `partial` for stream-end semantics.

## Failure Signals

- Invalid list ID: YouTube redirects to `https://www.youtube.com/` (final URL no longer contains `/playlist`) → `NOT_FOUND`.
- Login wall: URL moves to `accounts.google.com`/`/signin`, or the page shows a sign-in prompt with no avatar → `AUTH_REQUIRED`.
- Neither header renderer present on a `/playlist` URL → `DRIFT_DETECTED`.
- Continuation fetch non-OK or schema missing → primary path throws; command retries via the visible-DOM fallback.
- If both paths fail → `DRIFT_DETECTED`.

## Repair Clues

- Re-verify the lockup shape: YouTube has been migrating `playlistVideoListRenderer` → `lockupViewModel`; if items stop appearing, re-check `sectionListRenderer.contents[*]` for `itemSectionRenderer` vs newer renderers and update `collectPage`.
- Re-verify the header: new `pageHeaderViewModel` vs classic `playlistHeaderRenderer`; new layouts may move channel/stats under `metadata.contentMetadataViewModel`.
- The continuation token path may change between `continuationItemRenderer` and `continuationItemViewModel`; both are handled, but new variants should be added to the token detection in `collectPage`.
- DOM fallback title parsing is best-effort; prefer restoring the `ytInitialData` path over relying on it.
