# Evidence: youtube/channel-videos

This document records the research and validation evidence for the `youtube/channel-videos` command.

## Exploration Path

- Explore workspace: a prior explore workspace (explore assess passed, candidate youtube/channel-videos).
- Command library overlap: `youtube/get-feed` (homepage feed), `youtube/search` (search results). No name conflict.
- Capture browser contract read.
- Browser session used for validation: `<session>` (attach --cdp=chrome, self-owned tab, closed and detached after explore).

## Verified URLs

- https://www.youtube.com/@ExampleChannel/videos (videos tab: 30 first-screen lockups + scroll continuation; sort dropdown)
- https://www.youtube.com/@ExampleChannel/shorts (shorts tab: 48 shorts + sort chips)
- https://www.youtube.com/@ExampleChannel/streams (live tab: 14 streams + sort chips)
- https://www.youtube.com/@ExampleChannel/posts (posts tab: 10 posts + scroll continuation)
- https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx/videos (channel UC URL form works)
- https://www.youtube.com/@minutephysics (tab set difference: 课程 instead of 播客)
- https://www.youtube.com/@SamONellaAcademy (minimal tab set: 首页/视频/播放列表/搜索)
- https://www.youtube.com/@SamONellaAcademy/shorts (missing tab falls back to featured, no 404)
- https://www.youtube.com/@SamONellaAcademy/videos (stream exhaustion at 67 items, no continuation)

## Structural Evidence

- Channel page data path: `window.ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[]` (tabRenderer/expandableTabRenderer).
- Each tab: `tabRenderer.title` (localized), `tabRenderer.endpoint.commandMetadata.webCommandMetadata.url` (e.g. `/@ExampleChannel/videos`), `tabRenderer.selected`. URL path suffix is language-independent: 首页→featured, 视频→videos, Shorts→shorts, 直播→streams, 播客→podcasts, 课程→courses, 播放列表→playlists, 帖子→posts, 搜索→search.
- Header: `header.pageHeaderRenderer.content.pageHeaderViewModel`: `title.content` = channel name; `metadata.contentMetadataViewModel.metadataRows[]` → row 0 handle `@ExampleChannel`, row 1 subscribers `130万位订阅者` + video count `3654 个视频`.
- Videos/live grid: `tabRenderer.content.richGridRenderer.contents[]` = richItemRenderer (lockupViewModel) + continuationItemRenderer. First screen = 30 items; scroll/fetch continuation appends ~30 per batch.
- lockupViewModel fields (videos & live):
  - `contentId` = videoId
  - `title.content` = title
  - `metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[]` → `[{content:"12万次观看"},{content:"11小时前"}]` (delimiter " • "); live publishedAt text is `直播时间：4个月前`
  - `contentImage.thumbnailViewModel.overlays[0].thumbnailBottomOverlayViewModel.badges[].thumbnailBadgeViewModel.text` = duration `21:07` (also live badge animatedText)
  - `rendererContext.accessibilityContext.label` = "title + duration(中文)" fallback
  - `contentType` = LOCKUP_CONTENT_TYPE_VIDEO (both videos and live)
- Shorts grid: same richGridRenderer but item is `richItemRenderer.content.shortsLockupViewModel`:
  - `entityId` = `shorts-shelf-item-{videoId}`
  - `overlayMetadata.primaryText.content` = title; `overlayMetadata.secondaryText.content` = views (`3.2万次观看`)
  - `onTap.innertubeCommand.commandMetadata.webCommandMetadata.url` = `/shorts/{videoId}`; `reelWatchEndpoint.videoId` = videoId
  - No duration, no publishedAt.
- Posts: content is `sectionListRenderer.contents[0].itemSectionRenderer.contents[]` = `backstagePostThreadRenderer` + continuationItemRenderer:
  - `backstagePostThreadRenderer.post.backstagePostRenderer`: `postId`, `contentText.runs[]` (text with link runs), `publishedTimeText.runs[0].text` (time) with navigationEndpoint URL `/post/{postId}`, `voteCount.simpleText` = likes, `authorText.runs[0].text`.
- Sort: `chipBarViewModel.chips[].chipViewModel`: `text` + `displayType` (CHIP_VIEW_MODEL_DISPLAY_TYPE_DROP_DOWN for videos "最新"; UNSPECIFIED direct chips on shorts/live). Dropdown sheet items: `["最新","最热门","最早"]` (listItemViewModel.title.content). Sort values ↔ 最新(latest)/最热门(popular)/最早(oldest). Sort change does NOT change URL; it is applied via chip click. videos uses dropdown sheet (chip + sheet list item); shorts/live use direct chips. posts has no sort.
- Continuation: `continuationItemRenderer.continuationEndpoint.continuationCommand.token`, trigger CONTINUATION_TRIGGER_ON_ITEM_SHOWN. Exhaustion: no continuationItemRenderer when stream ends (verified @SamONellaAcademy 67 items).
- channel param forms verified: `@handle`, `youtube.com/@handle`, `youtube.com/channel/UC...` all resolve to the same channel page.

## Failure Signals

- Missing tab: navigating to a non-existent tab URL does not 404; page falls back to featured (首页) content while URL stays. Detect via ytInitialData tabs URL-path set: if requested path not present, fail TAB_UNAVAILABLE and list available paths.
- Channel not found / invalid handle: YouTube renders a channel-not-found page; detect via missing tabs + body text signals before content wait.
- Structure drift: ytInitialData missing or schema mismatch, or no richGridRenderer/sectionListRenderer → DOM fallback; if both fail → DRIFT_DETECTED.
- Continuation HTTP failure or empty continuation → stop and return partial=true (or fall back to DOM scroll).
- YouTube rate limiting: observed none during validation; mitigation via randomized waits, random mouse moves, controlled operation frequency (no bulk rapid navigation).

## Capture Assessment

This command should be captured. The path is verified end-to-end on real channels (videos/shorts/live/posts tabs, sort, continuation, exhaustion, missing-tab behavior, channel URL forms), reusable as `websculpt youtube channel-videos`, and complements the existing youtube/get-feed, youtube/search, and planned youtube/channel-info / get-video / get-playlist-videos commands. Runtime browser; no login required for public content.
