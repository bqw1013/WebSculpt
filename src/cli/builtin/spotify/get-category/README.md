# spotify/get-category

Fetch a Spotify podcast category page (`open.spotify.com/genre/{id}`) — e.g. the 喜剧 Comedy category. Returns the category name, the theme playlist shelves, and the **热门{类别}播客** (top shows in this category) section with show cards (id/url/title/publisher/cover), scrolling internally to load more shows up to `--limit`.

## Description

Given a genre page URL or an opaque genre id, opens the category page in the attached browser (Spotify's GraphQL API is not anonymously callable), reads the rendered DOM, and returns every content shelf. The show section is paginated internally by scrolling the page (the app fires `browsePage` with increasing `pagePagination.offset`), so `--limit` shows can be collected without manual scrolling. Genre ids are opaque and come from `spotify/list-categories`.

## Parameters

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `genre_id` | string | one of `genre_id`/`url` | - | Opaque genre id (e.g. `0JQ5DAqbMKFNr6gDrHHVKL`). Take it from `spotify/list-categories` output's `genreId` field. |
| `url` | string | one of `genre_id`/`url` | - | Category page URL, e.g. `https://open.spotify.com/genre/0JQ5DAqbMKFNr6gDrHHVKL`. |
| `limit` | string(number) | no | `20` | Max shows to return from the 热门{类别}播客 section, 1-100. |

## Return Value

```json
{
  "genreId": "0JQ5DAqbMKFNr6gDrHHVKL",
  "name": "喜剧",
  "shelves": [
    { "name": "Laugh out loud", "shows": [{ "id": "...", "url": "https://open.spotify.com/playlist/...", "title": "...", "publisher": "...", "cover": "https://i.scdn.co/image/..." }] },
    { "name": "热门喜剧播客", "shows": [{ "id": "4rOoJ6Egrf8K2IrywzwOMk", "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk", "title": "The Joe Rogan Experience", "publisher": "Joe Rogan", "cover": "https://i.scdn.co/image/ab67656300005f1f..." }] }
  ],
  "partial": false
}
```

- `shelves[]`: each shelf has a `name` and `shows[]`. The `shows` field holds the shelf's cards. For the 热门{类别}播客 shelf these are podcasts (`/show/{id}`, `publisher` = publisher). For theme playlist shelves the cards are playlists (`/playlist/{id}`, `publisher` = the card subtitle/description).
- `partial`: `true` when the 热门{类别}播客 section ran out of shows before reaching `--limit`.

## Usage

```
websculpt spotify get-category --url "https://open.spotify.com/genre/0JQ5DAqbMKFNr6gDrHHVKL"
websculpt spotify get-category --genre-id 0JQ5DAqbMKFNr6gDrHHVKL --limit 40
```

## Common Error Codes

- `MISSING_PARAM` — neither `--genre-id` nor `--url` was provided.
- `INVALID_PARAM` — `genre_id`/`url` does not look like a genre page/id, or `limit` is not an integer in 1-100.
- `EMPTY_RESULT` — the genre page did not render any content shelves (page structure drift or transient blank page).
- `DRIFT_DETECTED` — reserved for page structure changes that break the card selectors.
