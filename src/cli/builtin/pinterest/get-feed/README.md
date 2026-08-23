# pinterest/get-feed

Fetch the logged-in user's personalized Pinterest home feed.

## Description

Loads `https://www.pinterest.com/` in the logged-in browser session and returns the masonry stream of Pins shown on the homepage. Each Pin record carries the id, title, description, full-resolution image URL (or HLS playlist URL for video Pins), the outbound source link, the creator (username + display name), and the Pin page URL. The feed lazy-loads on scroll, so the command scrolls internally until it collects `limit` Pins or the feed is exhausted. Requires a logged-in Pinterest session.

A Pin is a single piece of content (an image or a video with a title/description/source link), similar to an Instagram post.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `limit` | number | no | 20 | Maximum number of Pins to return (1-100). The feed lazy-loads on scroll; the command scrolls until the limit is reached or the feed is exhausted (then returns fewer with `partial=true`). |

## Return Value

```jsonc
{
  "items": [
    {
      "id": "1083045410420876896",
      "title": "Smoothie Recipes Packed with Superfoods",
      "description": "These superfood smoothie recipes make healthy eating easy...",
      "imageUrl": "https://i.pinimg.com/originals/f4/91/53/f491534f4b70040d3cc591d2e2a67e11.png",
      "videoHlsUrl": null,             // omitted for image Pins; present for video Pins (HLS m3u8)
      "sourceLink": "https://healthyhabit-bfmcs3pa.manus.space/",   // may be null
      "creator": { "username": "adilhsham123", "displayName": "healthyhabits" },
      "pinUrl": "https://www.pinterest.com/pin/1083045410420876896/"
    }
  ],
  "count": 20,
  "limit": 20,
  "partial": false
}
```

- `items`: deduplicated Pin records (keyed by Pin id).
- `count`: number of Pins actually returned.
- `limit`: the requested limit.
- `partial`: `true` when the feed was exhausted (or access throttled) before reaching `limit`.

## Usage

```
websculpt pinterest get-feed
websculpt pinterest get-feed --limit 50
websculpt pinterest get-feed --limit 100
```

## Common Error Codes

- `AUTH_REQUIRED` — not logged in to Pinterest. The home feed is a personalized, login-gated stream; open Pinterest in Chrome and sign in first.
- `DRIFT_DETECTED` — the home feed page structure could not be found (selectors/SSR state changed).
- `INVALID_PARAM` — `limit` is not a positive integer.
- `LIMIT_EXCEEDED` — `limit` exceeds the maximum of 100.
