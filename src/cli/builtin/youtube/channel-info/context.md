# Context

## Precipitation Background (Why This Command Exists)

YouTube platform exploration found that `youtube/search` and `youtube/get-feed` return video cards but not a channel's profile card. A channel (≈ Bilibili UP主 / Douyin author) is a first-class content subject, and knowing its subscriber count / video count / description is a recurring need before deciding to browse its videos. `youtube/channel-info` was precipitated to fill that gap; the content list itself is a separate command (`youtube/channel-videos`).

## Value Assessment

- One lightweight page load returns the full profile card; no scrolling or tab switching (the home page already carries all fields).
- Complements `youtube/get-video` (whose output includes `channel.handle`) and `youtube/search` (whose channel-type results lack profile fields).
- Reusable for tracking creators: check a channel's size/description before listing videos, or resolve a `channelId`/URL to its canonical @handle URL.

## Page Structure

- Target page: channel home `https://www.youtube.com/@handle/` (equivalent forms: `/channel/UC...`, `/c/...`; trailing slash redirects to canonical).
- Data source: `window.ytInitialData`:
  - `metadata.channelMetadataRenderer` → `title` (name), `description` (FULL text, not truncated), `externalId` (channelId), `avatar.thumbnails[0].url`, `channelUrl`, `vanityChannelUrl`.
  - `header.pageHeaderRenderer.content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows` → `row[0]` handle (`@...`), `row[1]` parts = subscribers + videoCount.
- Description full text lives in `channelMetadataRenderer.description`; the pageHeaderViewModel `descriptionPreviewViewModel` is only the truncated preview (with `…更多`), so the command never needs to click "more".

## Environment Dependencies

- Browser runtime: attaches to the user's Chrome/Edge via CDP (remote debugging must be enabled). Reuses login/cookies but public channels need no login.
- Page language affects the subscriber/video-count display strings; the extraction regex covers Chinese (`位订阅|个视频|视频$`) and English (`subscri`, `videos?`).
- Polite pacing: command inserts a human-like pause, a random `page.mouse.move`, and a small random scroll before reading `ytInitialData`; keep call frequency low when scripting.

## Failure Signals

- 404 / invalid channel: page title contains `404 Not Found`, `ytInitialData` has no `metadata`. The command detects this before content extraction and throws `CHANNEL_NOT_FOUND`. `/c/` aliases only work for channels that actually own them.
- Missing header: `metadata.channelMetadataRenderer` present but `pageHeaderViewModel` absent → `DRIFT_DETECTED` (page structure changed).
- Field absence is NOT a failure: a channel with no @handle returns empty `handle` (url falls back to `channelUrl`); hidden subscriber/video counts return empty strings.

## Repair Clues

- If extraction returns empty fields or errors, re-open the channel home page and inspect `window.ytInitialData` for the current `metadataRows` layout. The handle row is the first part starting with `@`; subscribers/video counts are the other parts.
- Fallback alternative entry: use `https://www.youtube.com/channel/{channelId}` instead of the @handle URL; `channelId` is stable across handle renames.
- If YouTube changes the header renderer type (e.g. replaces `pageHeaderViewModel`), update the structural extraction and the `DRIFT_DETECTED` message.
