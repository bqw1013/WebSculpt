# Evidence: youtube/channel-info

This document records the research and validation evidence for the `youtube/channel-info` command.

## Exploration Path

- Checked command library first: `websculpt command list youtube` returned only `youtube/get-feed` and `youtube/search`. Neither covers a channel profile card (name, handle, subscribers, video count, description), so this is a new command.
- Verified path comes from a prior explore workspace, which passed `websculpt explore assess` (status: passed, candidate youtube/channel-info).
- Browser automation used `@playwright/cli` attached to the user's Chrome via CDP (session `<session>`), own tab only, user tabs untouched. The browser guide was read before running playwright-cli; the same page-behavior facts carry into the browser runtime contract.
- Polite pacing: random small scroll before extraction and paced navigation (no rapid successive page loads); verified data is unaffected by a small scroll.

## Verified URLs

- https://www.youtube.com/@ExampleChannel (channel home; the trailing-slash form redirects here)
- https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx (channel-ID URL form, stays on this URL, no redirect)
- https://www.youtube.com/c/GoogleDevelopers (legacy /c/ custom-URL form)
- https://www.youtube.com/@MrBeast (mega channel, verifies structure holds at scale)
- https://www.youtube.com/c/ExampleChannel (404 Not Found — error-signal verification)

## Structural Evidence

Data source is the page-embedded `window.ytInitialData` on the channel home page. Two locations are needed:

1. `ytInitialData.metadata.channelMetadataRenderer` (primary):
   - `title` -> channel display name (string)
   - `description` -> FULL description text, not truncated (multi-line string)
   - `externalId` -> channel ID like `UCxxxxxxxxxxxxxxxxxxxxxx`
   - `avatar.thumbnails[0].url` -> avatar image URL
   - `channelUrl` -> `https://www.youtube.com/channel/{externalId}`
   - `vanityChannelUrl` -> `http://www.youtube.com/@handle` (http, not used for output)
2. `ytInitialData.header.pageHeaderRenderer.content.pageHeaderViewModel` (for handle / subscribers / videoCount):
   - `title.dynamicTextViewModel.text.content` -> channel name (same as channelMetadataRenderer.title)
   - `metadata.contentMetadataViewModel.metadataRows` -> array of rows; each row has `metadataParts[]`, each part has `text.content`
   - `description.descriptionPreviewViewModel.description` -> TRUNCATED preview with `…更多`; not used (use channelMetadataRenderer.description for the full text)

metadataRows observed layout (verified on all three channels):
```
rows[0].metadataParts[0].text.content = "@ExampleChannel"          (handle)
rows[1].metadataParts[0].text.content = "130万位订阅者"          (subscribers)
rows[1].metadataParts[1].text.content = "3654 个视频"            (videoCount)
```
Extraction rules (locale-tolerant, verified against Chinese UI):
- handle = first flat part that starts with `@`
- subscribers = part matching `/位订阅|subscri/i`
- videoCount = part matching `/个视频|视频$|videos?$/i`

Output `url` is constructed as `https://www.youtube.com/@{handle}` (https canonical); if handle is missing, fall back to `channelMetadataRenderer.channelUrl`.

Real extraction sample (@ExampleChannel, home page):
```json
{
  "name": "Example Channel Name",
  "handle": "@ExampleChannel",
  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "url": "https://www.youtube.com/@ExampleChannel",
  "avatar": "https://yt3.googleusercontent.com/...",
  "subscribers": "130万位订阅者",
  "videoCount": "3654 个视频",
  "description": "Example channel description text..."
}
```
Second sample (@GoogleDevelopers via /c/ form, 267万位订阅者 / 6083 个视频) and third sample (@MrBeast, 5.13亿位订阅者 / 997 个视频) match the same structure.

## Failure Signals

- Nonexistent / bad channel URL -> page `document.title` is `404 Not Found` and `ytInitialData` has neither `metadata` nor `header`. The command must detect this BEFORE waiting for content selectors and throw `CHANNEL_NOT_FOUND`.
- A channel that has no `/c/` alias (e.g. `/c/ExampleChannel`) 404s; `/c/` only works for channels that actually own that legacy URL. The 404 branch covers this.
- A channel with no @handle (legacy, channel-ID only): `handle` resolves to empty string and `url` falls back to `channelUrl`.
- A channel that hides subscriber count or video count: the matching part is absent, that field is returned as empty string (no crash).
- ytInitialData structure drift (missing metadata/header or missing metadataRows): treat as `DRIFT_DETECTED`.
- Polite pacing: no CAPTCHA / 403 / 429 observed during exploration; still apply random scroll + mouse-move pacing and keep operations serial with controlled frequency to lower YouTube rate-limiting risk.

## Capture Assessment

This path is verified end-to-end with real extraction samples on three diverse channels and four URL input forms, and the explore audit passed. It should be captured as a `browser` runtime command: `youtube/channel-info` — a lightweight channel profile card (name, handle, channelId, url, avatar, subscribers, videoCount, description). It is clearly separable from existing `youtube/get-feed` (home feed) and `youtube/search` (search), and complements `youtube/get-video` / `youtube/channel-videos` by the shared `channel` parameter semantics. No login required for public channels.
