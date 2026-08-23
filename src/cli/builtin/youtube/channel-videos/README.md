# youtube/channel-videos

List a YouTube channel's content by tab (videos / shorts / live / posts) with sorting, in the user's attached Chrome session. Tracks a creator's content list — the core follow-a-creator command. Does not open detail pages or manage subscriptions.

## Description

The command reads YouTube's channel-page `ytInitialData`: the tab list, the rich grid / section list, and each item's native fields. Sorting is applied through the page's own sort chip/dropdown UI (sort does not change the URL). Items are loaded in batches via the browse continuation API while scrolling internally, up to `limit` (max 100). Posts return text-based cards; video-type tabs return video cards. Missing tabs are detected from the live tab list and reported with the channel's actual available tabs.

## Parameters

- `channel` (required): channel @handle (e.g. `@ExampleChannel`) or channel URL (`youtube.com/@handle`, `youtube.com/channel/UC...`).
- `tab` (optional, default `videos`): `videos` 视频 | `shorts` Shorts 短视频 | `live` 直播 | `posts` 帖子. Not every channel has every tab — if the tab is missing the command fails (`TAB_UNAVAILABLE`) and lists the tabs the channel actually has.
- `sort` (optional, default `latest`): `latest` 最新 | `popular` 热门 | `oldest` 最早. Applies to video-type tabs only; ignored (and reported in `ignoredParams`) for the posts tab.
- `limit` (optional, default `20`): strict positive integer; maximum `100` (`LIMIT_EXCEEDED` above the maximum).

## Return Value

The envelope is `{ channel, items, partial, count, source, fallbackUsed, ... }`:

- `channel`: `{ name, handle, url }` from the channel header.
- `items`: array of content cards.
  - videos / live: `{ videoId, title, url, type: "video"|"live", duration, views, publishedAt }`. Live items read like `直播时间：4个月前`.
  - shorts: `{ videoId, title, url, type: "short", views }` (no duration / publishedAt in the grid).
  - posts: `{ videoId: postId, title: postText, url: /post/{postId}, type: "post", likes, publishedAt }`.
- `partial`: `true` when the tab's stream was exhausted before reaching `limit`.
- `source`: `"ytInitialData"` (native) or `"dom"` (fallback); `fallbackUsed: true` when the DOM path ran.
- `pagesFetched`: number of browse pages fetched (native path).

## Usage

```bash
websculpt youtube channel-videos --channel @ExampleChannel --limit 5
websculpt youtube channel-videos --channel @ExampleChannel --tab shorts --limit 10
websculpt youtube channel-videos --channel @ExampleChannel --tab live --sort popular --limit 10
websculpt youtube channel-videos --channel "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx" --tab posts --limit 5
```

## Browser and pacing

Chrome/Edge remote debugging must be enabled so the WebSculpt browser daemon can attach to the user's existing session. No YouTube API key or separate login is required for public content. To keep a polite pacing profile the command uses randomized waits after navigation, between serial continuation requests, random mouse movement, and controlled operation frequency — it does not fan out to detail pages.

## Common Error Codes

- `MISSING_PARAM`: `channel` is absent or blank.
- `INVALID_PARAM`: malformed `limit`, or unsupported `tab` / `sort` value.
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `TAB_UNAVAILABLE`: the requested tab is not present on this channel; the message lists the channel's actual available tabs.
- `NOT_FOUND`: the channel does not exist.
- `DRIFT_DETECTED`: ytInitialData/continuation schema and visible DOM fallback both failed.
- `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, and `COMMAND_TIMEOUT` may be emitted by the browser runner.
