# techcrunch/get-feed

Fetch TechCrunch's latest article stream via the public WordPress REST API — the same chronological feed shown on the "Latest" page and every category page.

## Description

Returns article cards (title, URL, date, excerpt, featured image, editorial categories) from TechCrunch's public WP REST API. Optionally filter by one of 23 editorial categories (AI, startups, venture, security, apps, etc.). The command paginates internally (`per_page=100`) until the requested `limit` is reached or the stream is exhausted — when the stream runs out early, `partial=true` is returned.

No authentication and no browser required. For free-form topic/company labels (e.g. `apple`, `openai`), use `techcrunch/get-topic` instead.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `category` | enum | no | (all) | Editorial category slug to filter by. See full list below. |
| `limit` | number | no | `20` | Maximum number of articles to return (1-100). Paginates internally; `partial=true` when the stream is exhausted. |

### Available Categories (23)

`artificial-intelligence`, `startups`, `venture`, `security`, `apps`, `climate`, `biotech-health`, `commerce`, `cryptocurrency`, `enterprise`, `fintech`, `fundraising`, `gadgets`, `gaming`, `government-policy`, `hardware`, `media-entertainment`, `privacy`, `real-estate`, `robotics`, `social`, `space`, `transportation`

These correspond to the nav-bar editorial sections on techcrunch.com. Omit `category` to get the full chronological feed (same as `/latest/`).

## Return Value

```json
{
  "articles": [
    {
      "id": 3134560,
      "title": "Investors sue Selena Gomez alleging fraud tied to her mental health startup",
      "url": "https://techcrunch.com/2026/08/13/investors-sue-selena-gomez-alleging-fraud-tied-to-her-mental-health-startup/",
      "date": "2026-08-13T15:12:40",
      "excerpt": "The plaintiffs say they invested nearly $1.2 million in the company, and are...",
      "image": "https://techcrunch.com/wp-content/uploads/2026/08/GettyImages-2202517874.jpg",
      "categories": ["biotech-health", "startups"]
    }
  ],
  "count": 1,
  "partial": false,
  "category": null
}
```

- `articles`: array of article cards (see shape above). Order is reverse-chronological and matches the corresponding `/latest/` or `/category/{slug}/` page.
- `count`: number of articles returned (may be less than `limit` when `partial` is true).
- `partial`: `true` when the stream ran out before `limit` was reached (e.g. a category with fewer articles than requested).
- `category`: the category slug you filtered by, or `null` when no filter was applied.

## Usage

```
websculpt techcrunch get-feed
websculpt techcrunch get-feed --limit 50
websculpt techcrunch get-feed --category artificial-intelligence
websculpt techcrunch get-feed --category startups --limit 100
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not an integer in 1-100.
- `INVALID_CATEGORY`: `category` is not one of the 23 documented slugs.
- `NETWORK_ERROR`: could not reach the TechCrunch API.
- `API_ERROR`: API returned a non-2xx status (rate limiting or API change).
- `PARSE_ERROR`: API response could not be parsed as JSON.
- `DRIFT_DETECTED`: API response shape no longer matches the expected array format.
