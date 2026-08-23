# medium/get-staff-picks

Fetch Medium Staff Picks, the official editorial curation list maintained by Medium Staff.

## Description

Navigates to the Medium Staff Picks list page and extracts structured article data from the live Apollo Client cache. The list lazy-loads more items as the page is scrolled; the command scrolls automatically until the requested `--limit` is reached or the list is exhausted. Returns up to 100 staff-curated articles with full metadata and curator notes.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | no | 20 | Number of items to return (range 1-100; out-of-range throws INVALID_PARAM). If the list ends earlier, fewer items are returned with `partial: true`. |

## Return Value

```json
{
  "items": [
    {
      "rank": 1,
      "title": "Example Article Title",
      "subtitle": "Example subtitle for the curated article.",
      "url": "https://medium.com/@example-author/example-article",
      "author": {
        "name": "Example Author",
        "username": "example-author",
        "url": "https://medium.com/@example-author"
      },
      "clapCount": 823,
      "responseCount": 13,
      "readingTime": 10,
      "publishedAt": "2026-06-03T12:34:22.274Z",
      "tags": ["Example Tag", "Another Tag"],
      "previewImage": "https://miro.medium.com/v2/resize:fit:400/0*example.jpeg",
      "curatorNote": "Example curator note from Medium Staff.",
      "isLocked": false
    }
  ],
  "count": 1,
  "partial": false,
  "available": 100
}
```

- `partial` is `true` when the requested `limit` could not be reached because the list was exhausted (rare for Staff Picks).
- `available` is the total number of items loaded into the Apollo cache at extraction time.

## Usage

```bash
# Fetch the default 20 Staff Picks
websculpt medium get-staff-picks

# Fetch only the first 10
websculpt medium get-staff-picks --limit 10

# Fetch up to 100 (scrolls as needed)
websculpt medium get-staff-picks --limit 100
```

## Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_PARAM` | `--limit` is invalid (non-positive integer or outside 1-100) |
| `PAGE_LOAD_FAILED` | Page load timed out; Apollo state did not hydrate |
| `APOLLO_STATE_NOT_FOUND` | `window.__APOLLO_STATE__` and Apollo Client cache are missing; page structure may have changed |
| `CATALOG_NOT_FOUND` | Staff Picks catalog reference is missing |
| `ITEMS_NOT_FOUND` | Catalog items connection data is missing |
| `EMPTY_RESULT` | No valid article data could be extracted |
