# devto/list-videos

List DEV.to video articles.

## Description

This command returns a list of video articles from DEV.to — posts that contain an embedded YouTube video. It calls the public Forem API first and falls back to reading the `/videos` page in a browser when the API fails or is rate-limited.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | no | `20` | Maximum number of videos to return. Integer between `1` and `1000`. |

## Return Value

```json
{
  "source": "api",
  "videos": [
    {
      "id": 4527169,
      "title": "<video_title>",
      "path": "/<user_path_segment>/<article_slug>",
      "url": "https://dev.to/<user_path_segment>/<article_slug>",
      "video": "https://www.youtube.com/embed/<video_id>",
      "video_source_url": "https://youtu.be/<video_id>",
      "user_id": 4101116,
      "user": { "name": "<author_name>" }
    }
  ]
}
```

- `source` is either `"api"` or `"browser"`.
- `video` is the YouTube embed URL.
- `video_source_url` is the original YouTube link when available.
- `user_id` is only available from the API path.
- Fields that are `null` or `undefined` are omitted.

## Usage

```bash
# Default: 20 videos via API
websculpt devto list-videos

# Request up to 5 videos
websculpt devto list-videos --limit 5

# Request up to 100 videos
websculpt devto list-videos --limit 100
```

## Common Error Codes

- `INVALID_PARAM` — `limit` is missing, not a number, less than 1, or greater than 1000.
- `NOT_FOUND` — The videos page or API endpoint could not be found (usually indicates a structural drift).
- `EMPTY_RESULT` — No videos were returned.
- `RATE_LIMITED` — The API returned HTTP 429.
- `NETWORK_ERROR` — Both the API and the browser fallback failed.
- `BROWSER_ATTACH_REQUIRED` — Browser fallback was needed but browser remote debugging is not available.

## Prerequisites

No authentication required for the API path. Browser fallback requires a browser running with remote debugging enabled.
