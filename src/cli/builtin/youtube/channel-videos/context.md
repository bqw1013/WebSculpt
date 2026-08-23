# Context

## Precipitation Background (Why This Command Exists)

Tracking a creator's output is a core task. YouTube's channel page organizes content into tabs (videos / shorts / live / posts) with per-tab sort, but these are JS-rendered and personalized, and the tab set differs per channel. This command turns the verified channel-page extraction path into a reusable `websculpt youtube channel-videos` command so users do not re-explore the page structure each time.

## Value Assessment

High reuse: any "list what this creator posted" request. Complements youtube/search (keyword search) and youtube/channel-info (channel profile); covers the content-list half of channel tracking. Saves per-use exploration of channel page tabs, lockup structures, sort UI, and continuation mechanics.

## Page Structure

- Base: `https://www.youtube.com/{@handle|channel/UC...}`. Tab URL: `{base}/{videos|shorts|streams|posts}`.
- Data: `window.ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[]` — each tab has `title`, `endpoint.commandMetadata.webCommandMetadata.url` (language-independent path suffix), `selected`.
- Header: `header.pageHeaderRenderer.content.pageHeaderViewModel` → `title.content` (name), `metadata.contentMetadataViewModel.metadataRows` (handle + subscribers + videoCount).
- videos/live: `tabRenderer.content.richGridRenderer.contents[]` = `richItemRenderer.content.lockupViewModel` + `continuationItemRenderer`. First screen 30; each continuation batch ~30.
- shorts: same grid, item = `shortsLockupViewModel` (`entityId` = `shorts-shelf-item-{videoId}`, `overlayMetadata.primaryText/secondaryText`).
- posts: `tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[]` = `backstagePostThreadRenderer.post.backstagePostRenderer` + continuation.
- Sort UI: `chipBarViewModel.chips[]`; videos "最新" chip is `CHIP_VIEW_MODEL_DISPLAY_TYPE_DROP_DOWN` → sheet `listItemViewModel` options 最新/最热门/最早; shorts/live render direct chips. Sort does not change URL.
- Continuation: `continuationItemRenderer.continuationEndpoint.continuationCommand.token`; fetch via `POST /youtubei/v1/browse` with `{context, continuation}` (apiKey/context from `ytcfg`). Exhaustion = no continuation item remains.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled (browser runtime).
- Public content: no login required. Some channels show member-only/playlists filters; those are unrelated to the 4 command tabs.
- Polite pacing: randomized waits between navigation and continuation calls, random mouse movement before DOM scroll fallback, controlled frequency (max 10 continuation pages per call). No detail-page fan-out.
- UI language may vary (Chinese vs English) — the command keys off URL paths, not localized tab titles, so it is language-independent.

## Failure Signals

- `TAB_UNAVAILABLE`: requested tab path not in the live tab URL-path set; YouTube silently falls back to the featured tab when you visit a missing tab URL, so always compare against the parsed tab list.
- `NOT_FOUND`: invalid handle/channel → no tabs or channel-not-found body text.
- `DRIFT_DETECTED`: ytInitialData missing / schema mismatch and DOM fallback empty. Check for `lockupViewModel` → `videoRenderer` switch, `chipViewModel` rename, `backstagePostRenderer` → `postRenderer` change, or `twoColumnBrowseResultsRenderer` restructure.
- Continuation HTTP errors or empty continuation → stop with partial=true.

## Repair Clues

- Fallback path already implemented: DOM scroll extraction (`ytd-rich-item-renderer` / `ytd-backstage-post-renderer` + `yt-lockup-view-model`).
- If lockupViewModel disappears, look for `videoRenderer` / `shortsLockupViewModel` variants (youtube/search already handles these shapes).
- If `/youtubei/v1/browse` fails, re-check `ytcfg` INNERTUBE_API_KEY/INNERTUBE_CONTEXT availability; the DOM scroll fallback does not need them.
- Continuation responses arrive under `onResponseReceivedActions` OR `onResponseReceivedEndpoints` (appendContinuationItemsAction), or `continuationContents`. Extract tokens scoped to the tab's grid/section only — a blind recursive walk of the whole page can pick up a channel-featured token that resolves to the wrong page (observed: browse continuation came back with `route: channel.featured`).
- Browser-side `page.evaluate` / `waitForFunction` callbacks run in the page context and cannot reference Node-module constants — inline literals (observed: `ReferenceError: SORT_TEXTS is not defined`).
- views/publishedAt must be selected by pattern (`/观看|播放/`, `/直播时间|前$/`), not fixed index — joint videos put an extra creator name in metadataParts (observed: views/publishedAt swapped).
- Channel name is in `pageHeaderViewModel.title` (dynamicTextViewModel) or fallback `metadata.channelMetadataRenderer.title`; handle is the metadataRows entry starting with `@`.
- Sort does not change the URL; apply via chip click (shorts/live direct chips; videos dropdown sheet) and wait for the first item id in ytInitialData to change before re-snapshotting.
- Invalid channel pages may not set `window.ytInitialData`; detect NOT_FOUND from `document.title`/body text (`404`, `channel doesn't exist`, `不存在`) before waiting for ytInitialData.
