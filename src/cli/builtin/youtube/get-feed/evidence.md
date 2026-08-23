# Evidence: youtube/get-feed

This document records the research and validation evidence for the `youtube/get-feed` command.

## Exploration Path

- This is a **rework** of the existing installed command `youtube/get-feed` (user source), driven by the platform command plan: dynamic tab matching + limit raise to 100.
- `websculpt command domains` lists the `youtube` domain; `websculpt command list youtube` shows 2 commands: `youtube/get-feed` (rework target) and `youtube/search` (untouched).
- Browser automation followed the playwright-cli access guide. Explore session `<session>` attached to the user's logged-in Chrome; a dedicated tab navigated to the YouTube homepage.
- Explore workspace passed `websculpt explore assess` (status: passed, candidate: youtube/get-feed).

## Verified URLs

- https://www.youtube.com/ — homepage recommendation feed + dynamic filter chip bar. Primary data source for this command.

## Structural Evidence

All facts below verified in a live browser on 2026-08-14 (logged-in account).

### Dynamic chip bar (tab filter)

- Container: `#chips-wrapper` (DIV). Each chip: `yt-chip-cloud-chip-renderer` containing `button[role=tab]`.
- Chip text: `button.textContent.trim()`. Selected state: `button[role=tab]` `aria-selected` = "true" / "false" (chip also gets `iron-selected` class + `selected` attribute).
- The chip set is **personalized and changes between page loads / sessions**. Observed sets in one session:
  - Load A: `全部, 音乐, 播客, 直播, 说唱音乐, 最近上传, 发现新视频`
  - Load B: `全部, 播客, 音乐, 直播, 烹饪, 旅游景点, 最近上传, 发现新视频`
  - (earlier comprehensive explore: `全部, 播客, 音乐, 直播, 旅游, 烹饪, 最近上传, 已观看, 发现新视频`)
  - The old command hard-codes `全部/音乐/直播/播客/游戏/最近上传/发现新视频` — `游戏` never appeared in any live sample, and several real chips (such as music, cooking, travel, and watched) are missing. **Hard-coded enum drifts.**
- Clicking a chip: URL stays `https://www.youtube.com/`; `window.ytInitialData` is replaced in place (~400-700 ms); chip `aria-selected` flips synchronously; the first videoId changes. Robust click-confirm: poll until the target chip's `aria-selected` is "true", then wait for the first videoId to change (timeout ~5 s).

### Primary extraction path: `window.ytInitialData`

- Video items: `ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents[]`.
- Each video is inside `item.richItemRenderer.content`:
  - New format `lockupViewModel`: `contentId` (videoId), `metadata.lockupMetadataViewModel.title.content` (title), `metadata...contentMetadataViewModel.metadataRows[0].metadataParts[0].text.content` + `text.commandRuns[0].onTap.innertubeCommand.browseEndpoint.canonicalBaseUrl` (channel + channelUrl), `metadataRows[1].metadataParts[0/1].text.content` (views / publishedTime), duration via `contentImage.thumbnailViewModel.overlays[].thumbnailBottomOverlayViewModel.badges[].thumbnailBadgeViewModel.text`.
  - Legacy format `videoRenderer`: `videoId`, `title.runs[0].text`, `ownerText.runs[0].text` + `.navigationEndpoint.browseEndpoint.canonicalBaseUrl`, `viewCountText.simpleText`, `publishedTimeText.simpleText`, `lengthText.simpleText`.
- The last item in `contents` is a `continuationItemRenderer` with `continuationEndpoint.continuationCommand.token`.
- **`ytInitialData` accumulates ALL loaded items across continuation batches** (verified 23 → 46 → 70 → 94 → 118 videos in the same object); reading once after scrolling returns the full set.
- Mixes/compilations (e.g. `RDdQw4w9WgXcQ`) may have empty views/time/duration rows — normal.

### Scroll / lazy-load (limit 100)

- Continuation trigger element in DOM: `ytd-continuation-item-renderer`.
- **Fast reliable algorithm**: `document.querySelector('ytd-continuation-item-renderer').scrollIntoView({ block: 'center' })` then poll `ytInitialData` video count until it grows (measured ~763 ms latency; 6 s poll timeout is safe). Each batch adds ~23-24 videos.
- End-to-end clean run (fresh homepage, default tab): initial 23 → batch1 46 (1.27 s) → batch2 70 (2.32 s) → batch3 94 (3.28 s) → batch4 118 (4.01 s). **Reaching 100 is feasible in ~4 s with this algorithm.**
- Slow naive smooth `scrollBy` loop took ~45 s to 95 items and missed delayed continuations — rejected.

### Stream exhaustion → `partial`

- `直播` tab: only 6 videos, no `continuationItemRenderer` in `ytInitialData`, no `ytd-continuation-item-renderer` in DOM, `scrollHeight` ~1010 (no scroll room). Exhaustion detection: continuation marker absent AND at page bottom AND video count no longer grows → `partial: true`.
- Convention (matches arxiv/search etc.): `partial: true` when returned count < requested limit; `partial: false` when the limit was filled.

### DOM fallback (new structure)

The old command's DOM fallback selectors (`#video-title-link`, `a.ytd-rich-grid-video-renderer`, `ytd-video-meta-block span`) return **empty** on the current page. Current `ytd-rich-item-renderer` items contain `yt-lockup-view-model` (first item is often a `ytd-ad-slot-renderer` ad — skip). Verified working fallback extraction:
- title: `yt-lockup-metadata-view-model #video-title` / `h3 a`
- channel: `a[href^="/@"]` inside metadata
- views / publishedTime: metadata `span`s containing "次观看" / relative time
- duration: `yt-thumbnail-badge-view-model`
- videoId: `a[href*="/watch?v="]` href parse

### Polite pacing

Existing command already has human-like helpers (random mouse move `humanMove`, random smooth scroll, jittered sleeps, post-click random wait). Rework keeps them and paces the scroll loop (random mouse move before each continuation batch + jitter wait after growth) while keeping limit-100 runtime in the ~10 s range.

## Failure Signals

- `TAB_NOT_FOUND`: requested tab text matches no live chip → throw with the current available chip list appended (self-healing error).
- `INVALID_PARAM`: `limit` not a positive integer or out of 1-100 (validate raw string before navigation).
- `EMPTY_RESULT`: no video content found on the homepage (region restriction / unusual page state / CAPTCHA).
- `ytInitialData` absent or `richGridRenderer.contents` empty → fall back to DOM (`yt-lockup-view-model`), skipping `ytd-ad-slot-renderer` / `ytd-display-ad-renderer` items.
- Continuation no longer grows within poll timeout at the bottom → treat stream as exhausted (`partial: true`).
- Platform rate-limiting signals (CAPTCHA, 403/429) → surface as `EMPTY_RESULT` or timeout; slow down on retries.

## Capture Assessment

This command should be captured (re-installed as a rework). The homepage feed is a reliable, login-free substitute for the regionally unavailable Trending page. The rework fixes the two known defects: (1) the hard-coded tab enum that provably drifts against the personalized chip bar, and (2) the 50-item limit that under-serves users wanting more recommendations. The dynamic matching + self-healing error, the fast scroll-to-100 algorithm, and the `partial` semantics were all validated live with real extracted samples. Default behavior (limit 20, tab 全部) is unchanged, so the rework is backward-compatible.
