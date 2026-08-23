# vimeo/get-trending

Fetch Vimeo's current trending videos — the "See what's trending" block on the public discovery homepage (vimeo.com/watch, nav: Watch). Complements the editorial Staff Picks channels with a popularity signal.

## Description

Returns the trending video list with title, canonical URL, duration, upload date, view count, thumbnail and author. The data comes directly from Vimeo's trending API (`api.vimeo.com/curation_components/2/videos`) — the same endpoint that feeds the "See what's trending" block — so no browser session or login is needed. Public, free content only.

## Parameters

- `limit`: Maximum videos to return (1-100, default 20). The trending API exposes up to 2000 videos, so the limit is always satisfied; `partial=true` only appears if the API side runs out of data.

## Return Value

```json
{
  "total": 12345,
  "resultCount": 1,
  "pagesFetched": 1,
  "results": [
    {
      "id": "0000001",
      "title": "Example Title",
      "url": "https://vimeo.com/0000001",
      "duration": 123,
      "createdAt": "2026-01-01T00:00:00+00:00",
      "views": 123,
      "thumbnail": "https://i.vimeocdn.com/video/<thumb>-d_640x480?&r=pad&region=us",
      "author": { "name": "Example Creator", "url": "https://vimeo.com/examplecreator" },
      "badge": null
    }
  ],
  "partial": false,
  "source": "api"
}
```

- `url` is the clean canonical URL (no UI-only `?fl=wc` tracking param).
- `views` = `stats.plays` (play count).
- `thumbnail` = the 640px-wide picture from `pictures.sizes[0]`.

## Usage

```
websculpt vimeo get-trending
websculpt vimeo get-trending --limit 50
```

## Common Error Codes

- `INVALID_PARAM` — limit is not a positive integer.
- `LIMIT_EXCEEDED` — limit exceeds the max of 100.
- `JWT_EXPIRED` — the trending API rejected the anonymous JWT; the command transparently re-fetches it and retries, so this surfaces only when the retry also fails.
- `HTTP_ERROR` — /watch or the trending API returned a non-200 status.
- `DRIFT_DETECTED` — the /watch HTML no longer embeds `viewerBootstrap.jwt`, or the API response shape changed.
- `EMPTY_RESULT` — the trending API returned no pages.
