# dailymotion/get-channel-videos

Fetch the video stream of a Dailymotion topic channel, or the site-wide trending stream, from the public REST API. No login, no browser.

## Description

This command returns the video feed of one of Dailymotion's 17 fixed topic channels (e.g. `animals`, `music`, `tech`) with the ordering the channel page itself offers (trending / most-viewed / newest). Omit `--channel` to get the site-wide trending stream.

**Naming disambiguation:** in Dailymotion, "channel" means one of the 17 topic channels (`dailymotion.com/channel/{slug}`), NOT an uploader account. Uploaders are "users" — use `dailymotion/get-user` or `dailymotion/search --type user` for those.

The browser topic-channel pages (`/channel/{slug}`) currently render a generic "channel" account with an empty video grid, so this command reads the public API directly (same data the API exposes for those channels).

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `channel` | no | — (site-wide trending) | Topic channel slug: `animals`=动物, `auto`=汽车, `people`=名人, `fun`=喜剧与娱乐, `creation`=创作, `school`=教育, `videogames`=游戏, `kids`=儿童, `lifestyle`=生活与教程, `shortfilms`=短片(电影), `music`=音乐, `news`=新闻, `sport`=体育, `tech`=科技, `travel`=旅行, `tv`=电视, `webcam`=网络摄像头. Omit for site-wide trending. |
| `sort` | no | `trending` | `trending`=趋势 / `visited`=观看最多 (most viewed) / `recent`=最新 (newest). |
| `limit` | no | 20 | Max videos to return, 1-100. Paged internally; `partial=true` if exhausted first. |

## Return Value

```json
{
  "channel": { "slug": "music", "name": "Music" },
  "videos": [
    {
      "id": "<id>",
      "title": "<title>",
      "url": "<video-url>",
      "duration": "<duration>",
      "thumbnail": "<thumbnail-url>",
      "owner": "<owner>",
      "views": "<views>",
      "publishedAt": "<publishedAt>",
      "publishedAgo": "<publishedAgo>"
    }
  ],
  "partial": false
}
```

Field notes:

- `channel` — `{slug, name}` of the requested topic channel, or `null` when `--channel` was omitted (site-wide trending).
- `videos[].id` — video xid; `videos[].url` — watch URL. Both feed `dailymotion/get-video`.
- `videos[].duration` — seconds.
- `videos[].views` — view count, may be `null`.
- `videos[].publishedAgo` — human-relative age (e.g. `5h ago`); `publishedAt` — ISO 8601 UTC.
- `partial` — `true` when the stream ran out before reaching `limit`.

## Usage

```
websculpt dailymotion get-channel-videos --channel music --sort recent --limit 10
websculpt dailymotion get-channel-videos --channel sport --sort visited
websculpt dailymotion get-channel-videos --sort trending --limit 30
```

## Common Error Codes

- `INVALID_PARAM` — unknown `channel` slug, invalid `sort`, or `limit` not an integer in 1-100.
- `REQUEST_FAILED` — API HTTP error or network failure.
