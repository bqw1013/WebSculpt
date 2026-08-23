# youtube/get-feed

Fetch the YouTube homepage video feed as a trending substitute.

## Description

Since the dedicated YouTube Trending page (`/feed/trending`) is unavailable in some regions (redirects to homepage), this command extracts ranked video recommendations from the YouTube homepage. The homepage feed serves as a practical trending indicator, showing popular and recommended videos with full metadata.

The homepage has a **personalized, dynamic filter chip bar** (e.g. `全部` / `音乐` / `直播` / `播客` / `最近上传` / `发现新视频`) that changes per account and session. The `tab` parameter accepts **any chip text** and matches it against the live chip bar at runtime; if it doesn't match, the command fails and lists the chips currently present on the page.

Data is extracted primarily from YouTube's internal `ytInitialData` JSON (which accumulates items across continuation loads), with a DOM (`yt-lockup-view-model`) fallback for resilience. For `limit` larger than the initial batch, the command scrolls the feed internally and returns `partial: true` when the stream ends before the limit is reached.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `tab` | No | `全部` | Homepage filter chip text to match, e.g. `全部` (default), `音乐`, `直播`, `播客`, `最近上传`. Chips are **personalized per account/session** — these are common examples, not a fixed enum. If the text doesn't match any live chip, the command fails and lists the chips currently on the page. |
| `limit` | No | `20` | Maximum number of videos to return (1-100). The feed lazy-loads on scroll; the command scrolls until the limit is reached or the stream is exhausted (`partial=true`). |

## Return Value

```json
{
  "items": [
    {
      "rank": 1,
      "videoId": "dQw4w9WgXcQ",
      "title": "Example video title",
      "channel": "Example Channel",
      "channelUrl": "/@ExampleChannel",
      "views": "1.2万次观看",
      "publishedTime": "2小时前",
      "duration": "10:30",
      "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    }
  ],
  "count": 20,
  "partial": false
}
```

- `partial`: `true` when the feed stream ended before reaching the requested `limit`; `false` when the limit was filled.
- Mixes/compilations may have empty `views` / `publishedTime` / `duration` — this is normal.

## Usage

```
websculpt youtube get-feed
websculpt youtube get-feed --limit 10
websculpt youtube get-feed --tab 音乐
websculpt youtube get-feed --tab 直播 --limit 100
```

## Common Error Codes

| Code | Description |
|------|-------------|
| `TAB_NOT_FOUND` | The requested tab text doesn't match any live chip; the error message lists the chips currently available on the page |
| `INVALID_PARAM` | `limit` is not a positive integer or is outside 1-100 |
| `DRIFT_DETECTED` | Chip bar or chip click structure changed (chip not found / not clickable / not selectable) |
| `EMPTY_RESULT` | No video content found on the homepage (e.g., restricted region or unusual page state) |
| `COMMAND_TIMEOUT` | Page navigation or data extraction timed out |
| `BROWSER_ATTACH_REQUIRED` | Browser not connected — ensure Chrome remote debugging is enabled |
