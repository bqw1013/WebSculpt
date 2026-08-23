# spotify/search

Search Spotify podcasts by keyword — the equivalent of the search box's "Podcasts & Shows" tab.

## Description

Searches Spotify's web player for podcast shows and episodes using the platform's native GraphQL (`searchPodcasts` / `searchFullEpisodes`), not DOM scraping. The command opens `/search/{q}/podcastAndEpisodes`, reuses the app's own session responses for the first page, and re-issues the same persisted queries with an incremented offset when `--limit` exceeds one GraphQL page. Returns show cards (id/url/title/publisher/cover) and/or episode cards (id/url/title/parent-show/date/duration/cover). Browsing public search needs no login. Music-domain tabs (songs/artists/albums/playlists) are out of scope.

## Parameters

- `query` (required): search keywords, e.g. `joe rogan`. Free text. 中文：搜索关键词。
- `type` (optional, default `all`): result scope — `all` (both podcast shows and episodes), `podcasts` (shows only), `episodes` (episodes only, the `/search/{q}/episodes` sub-page). 中文：all 节目+单集 / podcasts 只节目 / episodes 只单集。
- `limit` (optional, default `20`, 1-100): max results per kind. Internally the command paginates with the GraphQL `offset` (page size 30); `partial: true` when a kind runs out before reaching `limit`. 中文：每类结果数上限，内部 offset 翻页。

## Return Value

```json
{
  "query": "joe rogan",
  "podcasts": [
    {
      "id": "4rOoJ6Egrf8K2IrywzwOMk",
      "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk",
      "title": "The Joe Rogan Experience",
      "publisher": "Joe Rogan",
      "cover": "https://i.scdn.co/image/..."
    }
  ],
  "episodes": [
    {
      "id": "2NqAFyrVQXlS3mOfmA4BKi",
      "url": "https://open.spotify.com/episode/2NqAFyrVQXlS3mOfmA4BKi",
      "title": "#2542 - Steve Hilton",
      "show": { "id": "4rOoJ6Egrf8K2IrywzwOMk", "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk", "title": "The Joe Rogan Experience" },
      "date": "2026-08-19T17:00:00Z",
      "duration": 10772201,
      "cover": "https://i.scdn.co/image/..."
    }
  ],
  "podcastTotalCount": 567,
  "episodeTotalCount": 1000,
  "partial": false
}
```

Only the arrays matching `--type` are present: `type=podcasts` → `podcasts` only; `type=episodes` → `episodes` only; `type=all` → both. `duration` is in milliseconds. `partial: true` means a requested kind returned fewer than `limit` because the result stream was exhausted.

## Usage

```
websculpt spotify search --query "joe rogan"
websculpt spotify search --query "joe rogan" --type episodes --limit 50
websculpt spotify search --query "comedy" --type podcasts
```

## Common Error Codes

- `MISSING_PARAM`: `--query` is required.
- `INVALID_PARAM`: `--type` not in all|podcasts|episodes; or `--limit` not a positive integer / > 100.
- `DRIFT_DETECTED`: the search page did not fire the search GraphQL queries within ~25s (consent wall or page redesign).
- `GRAPHQL_ERROR`: a re-issued query returned field-level errors (variables trimmed or schema drift).
- `BROWSER_ATTACH_REQUIRED` (infra): no Chrome CDP session — enable remote debugging.
