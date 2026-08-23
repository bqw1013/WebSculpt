# Evidence: youtube/get-playlist-videos

This document records the research and validation evidence for the `youtube/get-playlist-videos` command.

## Exploration Path

- Command library overlap checked: existing `youtube/get-feed` and `youtube/search`; no existing playlist command. `capture new` reported no name conflict.
- Explore workspace: a prior explore workspace (audit passed, `explore assess` status: passed, Confirmation recorded on 2026-08-14).
- Browser automation guide consulted; explore session `<session>` attached to the user's Chrome via `@playwright/cli`.
- Extraction path: render `/playlist?list={id}` in the user's browser, read `window.ytInitialData` for the first batch, then scroll to trigger the `/youtubei/v1/browse` continuation for the rest.

## Verified URLs

- `https://www.youtube.com/playlist?list=PLOU2XLYxmsIIAOskSyap13n9W-xOt_GP5` — public playlist "Google I/O 2026 Keynotes" (14 videos), all 14 items render in the initial page data; used for the happy-path sample.
- `https://www.youtube.com/playlist?list=PLBA45B830027E7ADE` — public playlist "100 Greatest Dance Hits of the 90's"; page header reports "58 个视频" but only 52 items are extractable after scrolling to exhaustion; used to verify continuation and the partial semantics.
- `https://www.youtube.com/playlist?list=WL` — Watch Later (稍后观看); loads only when logged in; empty in this session ("此播放列表中尚无视频").
- `https://www.youtube.com/playlist?list=LL` — Liked videos (赞过的视频); loads only when logged in; empty in this session.
- `https://www.youtube.com/playlist?list=PLTHISISNOTAREALIDXYZ` — invalid list ID; redirected to the YouTube homepage (error state).

## Structural Evidence

Navigation target: `https://www.youtube.com/playlist?list={id}` where `{id}` is the list ID extracted from the url parameter (full URL `youtube.com/playlist?list=...` or a bare ID like `PL...`, `UU...`, `WL`, `LL`).

Playlist metadata (new layout, used by public playlists), at `window.ytInitialData.header.pageHeaderRenderer.content.pageHeaderViewModel`:
- `title.dynamicTextViewModel.text.content` → playlist title
- `metadata.contentMetadataViewModel.metadataRows` → rows:
  - row 0 channel: `metadataParts[0].avatarStack.avatarStackViewModel.text.content` = `"创建者：Google for Developers"` (strip the `"创建者："` prefix); channel URL + channelId in `text.commandRuns[0].onTap.innertubeCommand.browseEndpoint` (`canonicalBaseUrl` like `/@GoogleDevelopers`, `browseId` like `UC_x5XG1OV2P6uZZ5FSM9Ttw`)
  - row 1 stats: text parts include `"14 个视频"` (parse leading integer as videoCount)

Playlist metadata (classic layout, used by WL/LL), at `window.ytInitialData.header.playlistHeaderRenderer`:
- `playlistId` → list ID
- `title.simpleText` → title
- `ownerText.runs[0].text` → owner name; `ownerEndpoint.browseEndpoint` → channelId + canonicalBaseUrl
- `viewCountText.simpleText`, `stats` (e.g. `["无视频","无人观看"]` for empty), `privacy`

Video items (first batch): `ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[*].lockupViewModel`:
- `contentId` → videoId (11 chars)
- `contentType` → filter to `LOCKUP_CONTENT_TYPE_VIDEO`
- `metadata.lockupMetadataViewModel.title.content` → video title
- `metadata.metadata.contentMetadataViewModel.metadataRows` → row 0 channel name, row 1 `["917万次观看", "直播时间：2个月前"]` (views + published time; not emitted in the output contract)
- `contentImage.thumbnailViewModel.overlays[0].thumbnailBottomOverlayViewModel.badges[0].thumbnailBadgeViewModel.text` → duration string (e.g. `"1:51:16"`)

Initial batch size: the `ytInitialData` playlist section carries all extractable video items up to 100 in one response (verified: 14-item playlist → 14, PLBA "58 个视频" → 42 extractable, a 100-video playlist → 100). For `limit <= 100` the initial batch is the primary data source; `partial` is `true` when it ends below `limit`.

Continuation (best-effort safety net, only triggered when `items < limit AND items < videoCount`): `sectionListRenderer.contents[1].continuationItemViewModel.continuationCommand.innertubeCommand` carries a token that is documented as `CONTINUATION_TRIGGER_ON_ITEM_SHOWN` (`POST /youtubei/v1/browse`). Findings:
- Direct fetch of that token (`/youtubei/v1/browse?key=...` or `?prettyPrint=false`, body `{context, continuation}` or with `clickTrackingParams`) returns a recommended-playlist `horizontalShelfViewModel` (10 `LOCKUP_CONTENT_TYPE_PLAYLIST` lockups), NOT additional videos. The `/youtubei/v1/next` endpoint returns a watch-page `secondaryResults` recommendation panel, also not the full list.
- Scrolling the page appends the recommended-playlist shelf into the DOM (these lockups are identified by a `content-id-PL...` class on their host element and must be filtered out — their thumbnail anchors are `/watch?v={videoInThatPlaylist}` so they otherwise look like videos). No additional real videos load for PLBA, i.e. 42 is its complete extractable set (16 official count entries are unavailable/private and are not present in the data).
- `page.bringToFront()` after navigation is REQUIRED in the daemon: without it the page is a background tab, Chrome throttles IntersectionObserver/lazy loading, and neither scrolling nor `window.scrollBy` triggers any load (verified: scrollY stayed 0, no browse POST, DOM did not grow).
- The scroll fallback extracts newly loaded items from DOM `yt-lockup-view-model` (videoId from `a[href*="/watch?v="]`, duration from the time-status badge or a `m:ss` pattern, title from the title anchor, channel from a `/@` or `/channel/` anchor). It stops as soon as a scroll round adds no real videos (stream exhausted) or the limit is reached.

Empty personal playlists (WL/LL in this session): page header exists via `playlistHeaderRenderer`, no lockup items → `items: []`, `videoCount: 0`, `partial: true`.

## Failure Signals

- Invalid list ID: navigation stays on `/playlist?list={id}` but the SPA renders the homepage feed (page title becomes "YouTube", no playlist header, no playlist section). Detect via `header` absent + (title === "YouTube" or no tab content or body not-found markers) and fail with `NOT_FOUND` ("播放列表不存在或 ID 无效"). (In explore the same invalid ID redirected the URL to `https://www.youtube.com/`; the daemon SPA keeps the URL, so both the redirect check and the header/content check are needed.)
- Login required (WL/LL or private playlists): if not logged in, YouTube shows a sign-in wall and the header/items renderers are absent. Detect via a sign-in prompt in the body with no account avatar and fail with `AUTH_REQUIRED`. (In this session the browser was logged in; both WL and LL were empty.)
- Metadata videoCount (e.g. "58 个视频") may exceed the number of extractable items (42 for PLBA) because the official count includes unavailable/private videos that are absent from the data. The command reports the actually-extracted items and relies on `partial` for stream-end semantics.
- Background-tab throttling: without `page.bringToFront()` after navigation the daemon's page does not scroll (scrollY stays 0), no continuation fires and the DOM does not grow. Always bring the page to front before scrolling.
- Recommended-playlist shelf lockups pollute the video list (they carry `content-id-PL...` classes and thumbnail anchors to `/watch?v=`). Filter them out when extracting from the DOM, otherwise non-playlist videos are falsely reported.
- Structural drift: the playlist page has two header renderers (`pageHeaderRenderer` new layout vs `playlistHeaderRenderer` classic) and lockup renderers can change. If neither header is found on a genuine `/playlist` page (and it is not a NOT_FOUND/not-logged-in state), fail with `DRIFT_DETECTED`.
- Polite pacing: navigation, scroll and continuation use small random waits and gentle random pointer moves; the implementation performs no write operations (no clicks on "Watch Later" etc.). Consecutive invocations keep a human-like cadence; observed no CAPTCHA/429/403 during the test run.

## Capture Assessment

Capture as `youtube/get-playlist-videos` (browser runtime). The path is verified with real extractions across three public playlists (14-item full render, PLBA "58 个视频"/42 extractable with the recommended-shelf false-positive corrected, a 100-video playlist returning all 100) and two personal playlists (empty WL/LL), plus error states (empty url, invalid limit, limit > 100, invalid list ID, unknown option). The command produces chainable output (videoId → `youtube/get-video`, channel url/handle → `youtube/channel-info`) and covers the plan's required url/limit parameters and `partial` semantics. The continuation is a best-effort safety net (initial `ytInitialData` already covers `limit <= 100`); this deviation from the plan's "scroll internally up to 100" is documented and driven by one-hand testing. No existing command overlaps this path.
