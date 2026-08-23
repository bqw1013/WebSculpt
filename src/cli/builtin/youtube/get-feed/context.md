# Context

## Precipitation Background (Why This Command Exists)

Rework of the existing `youtube/get-feed` command. The old version hard-coded the homepage tab enum (`全部/音乐/直播/播客/游戏/最近上传/发现新视频`) and capped `limit` at 50. Live testing proved the homepage filter chip bar is **personalized and changes between page loads/sessions** (`游戏` never appeared; real chips included various personalized topic chips such as music, cooking, travel, and watched), so the hard-coded enum drifted. The rework matches any tab text against the live chip bar at runtime and raises the limit to 100 via internal scrolling with `partial` semantics.

## Value Assessment

- Homepage feed is the practical substitute for the regionally-unavailable Trending page (login-free, reliable).
- `tab` free-text + self-healing `TAB_NOT_FOUND` error (lists available chips) removes enum-drift breakage.
- `limit` up to 100 with fast scroll-into-view loading serves batch research / personal curation.

## Page Structure

- **Primary URL**: `https://www.youtube.com/`
- **Primary data source**: `window.ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents[]`
- Video item keys (inside `item.richItemRenderer.content`):
  - `lockupViewModel` (new): `contentId` = videoId; `metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows[0/1].metadataParts[]` = channel row / views+time row; duration via `contentImage.thumbnailViewModel.overlays[].thumbnailBottomOverlayViewModel.badges[].thumbnailBadgeViewModel.text`
  - `videoRenderer` (legacy): `videoId`, `title.runs[0].text`, `ownerText.runs[0]`, `viewCountText.simpleText`, `publishedTimeText.simpleText`, `lengthText.simpleText`
- **Continuation**: last `richGridRenderer.contents` item is `continuationItemRenderer` (token via `continuationEndpoint.continuationCommand.token`). `ytInitialData` **accumulates all loaded items** across continuations — read once at the end.
- **Chip bar**: `#chips-wrapper yt-chip-cloud-chip-renderer button[role=tab]` (fallback container: `#chips`); text via `textContent.trim()`; selected state via `aria-selected="true"` (chip also gets `iron-selected` class). The chip bar renders **asynchronously** after `domcontentloaded` — the command `waitForFunction`s for it (15 s timeout) before reading; if it never appears it throws `DRIFT_DETECTED` with a page-state dump.
- **DOM fallback** (current structure): `ytd-rich-item-renderer` → `yt-lockup-view-model` → `yt-lockup-metadata-view-model`; title `#video-title`/`h3 a`; channel `a[href^="/@"]`; views/time from metadata `span`s; duration `yt-thumbnail-badge-view-model`; videoId from `a[href*="/watch?v="]`. **Skip `ytd-ad-slot-renderer` / `ytd-display-ad-renderer`.**

## Environment Dependencies

- **Login state**: not required for public homepage access.
- **Browser config**: requires Chromium-based browser with remote debugging enabled.
- **Polite pacing strategy**:
  - `domcontentloaded` navigation + `waitForFunction` on `ytInitialData` to avoid ad/tracker timeouts.
  - Random mouse moves, jittered sleeps, scroll-into-view pacing — the scroll loop does one human mouse move per continuation batch and a jittered wait after each growth, keeping limit-100 in the ~10 s range.
- **Stability notes**: `ytInitialData` structure changes periodically; DOM fallback (`yt-lockup-view-model`) covers minor drift.

## Failure Signals

- Chip bar empty / `#chips-wrapper` missing → `DRIFT_DETECTED` (throw before extracting).
- Requested tab matches no live chip → `TAB_NOT_FOUND` with available chips in the message.
- Chip clicked but `aria-selected` never flips → `DRIFT_DETECTED`.
- `window.ytInitialData` absent or contents empty → DOM fallback; if both empty → `EMPTY_RESULT`.
- Continuation element absent OR no growth within the 6 s poll window at the bottom → treat as stream exhausted → `partial: true`.
- Platform rate limiting (CAPTCHA / 403 / 429) surfaces as `EMPTY_RESULT` or a timeout — slow down and retry.

## Repair Clues

- If the `ytInitialData` path changes, inspect `window.ytInitialData` in the browser console and trace the new video content path.
- If the chip bar selector changes, open the homepage and dump `#chips-wrapper` outerHTML to find the new chip renderer/button structure. If `#chips-wrapper` disappears, `#chips` is the fallback container (both are in `CHIP_SELECTOR`).
- **Playwright evaluate constraint**: `page.evaluate(fn, ...)` accepts only ONE argument — pass multiple values as a single object (`{ a, b }`). `page.evaluate(fn, a, b)` throws "Too many arguments".
- If DOM fallback breaks, re-check `ytd-rich-item-renderer` internals (the lockup/metadata element tags may have changed).
- Alternative stable path: an official YouTube Data API (requires an API key) — out of scope for this command.
