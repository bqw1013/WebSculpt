# dailymotion/get-video

## Description

Fetch full metadata for a single Dailymotion video by URL or ID: title, description, duration, publish time, view/like counts, tags, topic channel, language, thumbnail, and uploader. Optionally also fetch comments (API-only; the website has no comment UI) and subtitle tracks. Uses the public Dailymotion API — no login or browser required.

## Parameters

| name | type | required | default | description |
|---|---|---|---|---|
| `url` | string | yes | - | Video URL (`https://www.dailymotion.com/video/xaxueoe`) or bare ID (`xaxueoe`). IDs come from any dailymotion list/search result or the video page URL. |
| `include_comments` | boolean | no | `false` | Set to `true` to also fetch comments. Most Dailymotion videos have zero comments — an empty list is normal, not an error. |
| `comment_limit` | number | no | `20` | Maximum comments to return (1-100). Only used when `include_comments` is true. If the video has more comments than this, `partial: true` is set. |
| `include_subtitles` | boolean | no | `false` | Set to `true` to also return subtitle tracks (language + URL). Most videos have none. |

## Return Value

```jsonc
{
  "id": "string",                  // video ID, e.g. <video-id>
  "title": "<title>",
  "url": "string",                 // https://www.dailymotion.com/video/{id}
  "description": "<description>",  // <br /> HTML stripped
  "duration": "<duration>",        // seconds
  "createdAt": "<createdAt>",      // derived from created_time
  "views": "<views>",              // view count (the site page does not display it)
  "likes": "<likes>",              // like count (the site page does not display it)
  "tags": [],                      // tag array (hashtags live in the description, not here)
  "channel": "<channel>",          // one of Dailymotion's 17 topic channel slugs (NOT the uploader)
  "language": "<language>",
  "thumbnail": "<thumbnail-url>",
  "owner": { "id": "<owner-id>", "username": "<owner-username>", "screenname": "<owner-screenname>", "url": "<owner-url>" },
  "comments": [ { "author": "<author>", "text": "<text>", "createdAt": "<createdAt>" } ],  // only when include_comments=true; usually []
  "subtitles": [ { "language": "<language>", "url": "<subtitle-url>" } ],             // only when include_subtitles=true; usually []
  "partial": true                   // only when comments were truncated by comment_limit
}
```

`channel` enum (17 fixed topic channels): `animals, auto, people, fun, creation, school, videogames, kids, lifestyle, shortfilms, music, news, sport, tech, travel, tv, webcam`.

## Usage

```
websculpt dailymotion get-video --url https://www.dailymotion.com/video/<video-id>
websculpt dailymotion get-video --url <video-id>
websculpt dailymotion get-video --url <video-id> --include_comments true --comment_limit 50 --include_subtitles true
```

Note: boolean options take an explicit value (`--include_comments true` / `--include_comments false`); the bare flag form `--include_comments` is not accepted by the CLI.

## Common Error Codes

- `MISSING_PARAM` — `url` is required.
- `INVALID_PARAM` — cannot extract a video ID from `url`, or `comment_limit` is not an integer 1-100.
- `NOT_FOUND` — the video ID does not exist (API HTTP 404).
- `DRIFT_DETECTED` — Dailymotion API rejected the requested fields (HTTP 400, likely an API contract change).
- `HTTP_ERROR` — API returned a non-200 status or timed out.
- `NETWORK_ERROR` — could not reach api.dailymotion.com.
