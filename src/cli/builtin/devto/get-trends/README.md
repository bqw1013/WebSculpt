# devto/get-trends

Fetch DEV.to community trends from the `/trending` page.

## Description

This command reads the rendered `/trending` page and extracts the AI-generated trend analysis summaries, trend titles, 7-day post counts, key discussion areas, and cover images. This is a browser-only path because DEV.to does not expose trends through a public API.

## Parameters

| Name | Required | Description |
|------|----------|-------------|
| `tag` | No | Trend tag slug (without `#`). Must be one of the tags listed in the page filter. Omit to return all trends. |

## Return Value

```json
{
  "url": "https://dev.to/trending[?tag=<tag>]",
  "tag": "<tag> | null",
  "available_tags": ["<tag1>", "<tag2>", "..."],
  "trends": [
    {
      "tag": "#<tag> | null",
      "tag_url": "https://dev.to/t/<tag> | null",
      "posts_count_7d": 23,
      "title": "<trend title>",
      "trend_url": "https://dev.to/trending/<slug>",
      "cover_image": "https://<cdn>/image.png | null",
      "summary": "<AI-generated community analysis text>",
      "key_areas": ["<prompt 1?>", "<prompt 2?>", "..."],
      "active_ago": "<relative time>"
    }
  ]
}
```

Fields with no value are omitted from the output.

## Usage

```bash
# All trends
websculpt devto get-trends

# Filtered by tag
websculpt devto get-trends --tag <tag>
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_PARAM` | The provided `tag` is not a valid slug or is not a recognized trend filter. |
| `EMPTY_RESULT` | The page loaded but no trend cards were found. |
| `BROWSER_ATTACH_REQUIRED` | Browser remote debugging is not available. |
| `NETWORK_ERROR` | The page could not be reached. |
