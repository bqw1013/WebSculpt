# pinterest/get-pin

## Description

Fetch the full detail of a single Pinterest **Pin** (one image or video post). Given a Pin URL or numeric id, the command returns the SSR-rendered metadata: title, description, full-resolution image (or HLS playlist for video Pins), outbound source link, creator, reaction count and comment count. Optionally also returns the Pin's comments (`--include_comments true`) and the "More like this" related Pins (`--related_limit N`).

Requires a logged-in Pinterest browser session.

## Parameters

- `url` (required): Pin URL `https://www.pinterest.com/pin/<id>/` or a bare numeric Pin id. Obtained from `pinterest/search`, `pinterest/get-feed`, `pinterest/get-board` or `pinterest/get-user` output.
- `include_comments` (optional, default `false`): set to `true` to also return the Pin's comments. Comments lazy-load, so this makes the command slower.
- `comment_limit` (optional, default `20`, 1-100): maximum number of comments to return. Only used when `include_comments` is true.
- `related_limit` (optional, default `0`, 0-50): number of related Pins ("More like this") to also return. `0` disables.

## Return Value

```json
{
  "id": "1095219203159229945",
  "title": "45-Day Premium Keto Wellness Roadmap for Women: ...",
  "description": "You’ve tried the crash diets. They burned you out. ...",
  "imageUrl": "https://i.pinimg.com/originals/3b/71/90/3b71902aae2fe7656e6c903ca6883772.jpg",
  "videoHlsUrl": null,
  "sourceLink": "https://payhip.com/b/Lo8Ot",
  "creator": {
    "username": "razorrace0068",
    "displayName": "Modern Keto Life | Smart Weight Loss & Fitness",
    "profileUrl": "https://www.pinterest.com/razorrace0068/"
  },
  "reactionCount": 325,
  "commentCount": 10,
  "comments": [
    { "author": "leila", "text": "Oooh and sometimes I add an extra 1/2 cup of berries", "createdAt": "Wed, 12 Aug 2026 22:43:30 +0000" }
  ],
  "relatedPins": [
    { "id": "4606760282029056384", "title": "Healthy Blueberry Smoothie Recipes: ...", "imageUrl": "https://i.pinimg.com/originals/ff/30/33/ff303345086595719395c6126c7ab066.jpg", "pinUrl": "https://www.pinterest.com/pin/4606760282029056384/" }
  ],
  "partial": true
}
```

- `imageUrl` (image Pins) and `videoHlsUrl` (video Pins) are mutually exclusive; video Pins expose the HLS master playlist (multi-bitrate + audio variant).
- `comments` and `relatedPins` are only present when requested.
- `partial: true` means the requested comment/related limit could not be fully reached before the source was exhausted.
- `comments[].createdAt` is best-effort: it is enriched from the lazy-loaded comment feed API. On pins with many comments, a small share (typically <15%) may return `createdAt: null` when the underlying API response for that comment was not captured; `author` and `text` are always present.

## Usage

```
websculpt pinterest get-pin --url https://www.pinterest.com/pin/1095219203159229945/
websculpt pinterest get-pin --url 1095219203159229945 --include_comments true --comment_limit 50
websculpt pinterest get-pin --url 1095219203159229945 --related_limit 10
```

## Common Error Codes

- `MISSING_PARAM` — required `url` missing or empty.
- `INVALID_PARAM` — `url` is not a Pin URL or numeric id; `comment_limit`/`related_limit` not a non-negative integer.
- `LIMIT_EXCEEDED` — `comment_limit` > 100 or `related_limit` > 50.
- `NOT_FOUND` — Pin id does not exist (Pinterest redirects to `/?show_error=true`).
- `DRIFT_DETECTED` — the SSR script or expected DOM structure changed; the page failed to load.
- `BROWSER_ATTACH_REQUIRED` — emitted by the runtime when the daemon cannot attach to a logged-in Chrome.
