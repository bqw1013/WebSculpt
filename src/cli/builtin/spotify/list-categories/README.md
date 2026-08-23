# spotify/list-categories

List Spotify's full podcast category tree.

## Description

Fetches the "所有播客类别" (All Podcast Categories) page (`/genre/0JQ5DArNBzkmxXHCqFLx2U`) and returns every category in the tree: 8 top-level categories plus their children (43 categories total, max depth 2). Each entry carries the category's localized name, its opaque 22-character genre id, its page URL, and its parent category name (`null` for top-level).

The `genreId` values are the accepted input for `spotify/get-category --genre-id` — they are opaque strings that cannot be guessed, so this command is the discovery entry for category browsing.

## Parameters

None. The page loads the whole tree in a single request; there is no pagination or filtering.

## Return Value

```json
{
  "categories": [
    { "name": "体育", "genreId": "0JQ5DAqbMKFLhhtGqqgAsz", "url": "https://open.spotify.com/genre/0JQ5DAqbMKFLhhtGqqgAsz", "parent": null },
    { "name": "棒球", "genreId": "0JQ5IMCbQBLmsaPle4skuf", "url": "https://open.spotify.com/genre/0JQ5IMCbQBLmsaPle4skuf", "parent": "体育" }
  ],
  "count": 43
}
```

- `name`: localized category name — the browser context UI language decides it (e.g. Chinese UI gives 体育/喜剧, English UI gives Sports/Comedy). Names are not necessarily unique: two distinct categories can render the same name in a given locale (e.g. both "电玩" / "Video Games") under different top-level groups. Use `genreId` as the key.
- `genreId`: the opaque 22-character Spotify genre id (the `/genre/{id}` URL segment).
- `url`: category page URL.
- `parent`: the top-level category name for a child, or `null` for the 8 top-level categories.

## Usage

```
websculpt spotify list-categories
websculpt -f json spotify list-categories
```

## Common Error Codes

- `DRIFT_DETECTED` — the category shelf selector (`[data-testid="component-shelf"]`) was not found; the page structure likely changed.
- `EMPTY_RESULT` — the page rendered but no categories could be extracted.
