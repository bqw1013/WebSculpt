# vimeo/get-category

List videos in a Vimeo category, fetched from the public SSR category list pages (vimeo.com/categories/{cat}/videos). No login, no API key, no browser required.

## Description

Returns the video-card listing for one of Vimeo's ten editorial categories, in a chosen sort order, paginating internally up to the requested limit. Each video card carries title, URL, duration, author name/URL, view count (when the page shows one), and a thumbnail.

## Parameters

- `category` (required, enum): one of `animation | adsandcommercials | brandedcontent | comedy | documentary | experimental | music | narrative | sports | travel`. The slug is the last segment of the category URL.
- `sort` (optional, enum, default `featured`): `featured | relevant | date | alphabetical | plays | likes | duration`. Maps to the category page's sort control; `relevant` currently yields the same order as `featured`.
- `limit` (optional, number, default 20, range 1-100): maximum videos to return. Category pages list 18 per page; the command paginates internally.

## Return Value

```json
{
  "category": "documentary",
  "sort": "featured",
  "maxLimit": 100,
  "resultCount": 1,
  "pagesFetched": 1,
  "videos": [
    {
      "id": "0000001",
      "title": "Example Title",
      "url": "https://vimeo.com/0000001",
      "duration": "00:00",
      "author": { "name": "Example Creator", "url": "/examplecreator" },
      "views": "1.2K",
      "thumbnail": "https://i.vimeocdn.com/video/<thumb>-d_150x84?region=us"
    }
  ],
  "partial": false
}
```

- `views` is null when the page shows no view count for a card (observed on ~4 of 18 cards).
- Placeholder cards (removed/private videos shown with a default thumbnail and no link) are skipped; only real videos with a URL are returned.
- `partial` is present (true) only when the listing ran out before the requested limit (0 real cards on a page, no next page, or no new IDs). All ten categories are large, so partial rarely fires for limits up to 100.
- `maxLimit` is always 100; `pagesFetched` counts SSR pages read.

## Usage

```
websculpt vimeo get-category --category documentary --sort plays --limit 50
websculpt vimeo get-category --category animation
websculpt vimeo get-category --category music --sort date --limit 5
```

## Common Error Codes

- `MISSING_PARAM` — required `category` not provided.
- `INVALID_PARAM` — `category`/`sort` not in the enum, or `limit` not a positive integer.
- `LIMIT_EXCEEDED` — `limit` > 100.
- `NOT_FOUND` — unknown category slug or the page returns Vimeo's "VimeUhOh" 404.
- `HTTP_ERROR` — non-2xx response (after one retry on 429/503/504).
- `ANTI_BOT` — Vimeo served a challenge page; slow down and retry.
- `DRIFT_DETECTED` — page returned no video cards on the first page (structure drift).
