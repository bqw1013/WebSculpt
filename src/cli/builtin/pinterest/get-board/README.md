# pinterest/get-board

## Description

Fetch a Pinterest Board and the Pins inside it. A **Board** is a user-curated collection (like a bookmark folder or album) that groups saved Pins by theme — it can hold thousands of Pins on the same topic. This command returns the board's metadata (name, description, total Pin count, owner) plus a list of Pins inside it, scrolling to load more until the `limit` is reached or the board is exhausted.

Requires a logged-in Pinterest browser session.

## Parameters

- `url` (required): Board URL in the form `https://www.pinterest.com/<username>/<board-slug>/`. Obtain it from `pinterest/get-user --tab saved` output or `pinterest/search --type board` results. A bare path like `/joyfilledeats/all-recipes-from-joy-filled-eats/` is also accepted (`https://` is prepended).
- `limit` (optional, default `20`, range `1-100`): Maximum number of Pins to return. Boards can contain thousands of Pins; the command scrolls until the limit is reached or the board is exhausted (then returns fewer with `partial: true`).

## Return Value

```json
{
  "name": "string",
  "description": "string",
  "pinCount": "number",
  "owner": { "username": "string", "displayName": "string" },
  "boardUrl": "string",
  "pins": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "mediaType": "image | video",
      "imageUrl": "string | null",
      "videoHlsUrl": "string | null",
      "sourceLink": "string | null",
      "creator": { "username": "string", "displayName": "string" } | null,
      "pinUrl": "string"
    }
  ],
  "partial": true | false
}
```

Notes:
- `imageUrl` is the full-resolution pinimg.com original for image Pins, and the cover thumbnail for video Pins.
- `videoHlsUrl` is present only for video Pins (`v1.pinimg.com/videos/.../hls/*.m3u8`). A video Pin is detected by the presence of `videos.video_list` in the feed payload (the `is_video` flag is unreliable).
- `sourceLink` is the outbound link the Pin points to (may be null).
- `partial` is `true` when fewer than `limit` Pins were returned because the board ran out (its `pinCount` may be slightly higher than the number actually returned).

## Usage

```bash
websculpt pinterest get-board --url https://www.pinterest.com/joyfilledeats/all-recipes-from-joy-filled-eats/ --limit 5
```

## Common Error Codes

- `MISSING_PARAM` — `url` is empty.
- `INVALID_PARAM` — `limit` is not an integer in `1-100`.
- `NOT_FOUND` — the board URL does not exist (Pinterest redirects to `/?show_error=true`).
- `DRIFT_DETECTED` — the page structure changed (board header or Pin feed no longer found).
