# spotify/get-podcast

Fetch a Spotify podcast show (open.spotify.com/show/{id}) — the podcast itself, i.e. the continuing series, NOT a single episode (use `spotify/get-episode` for that).

## Description

Returns the show's metadata (title, publisher, full description, listener rating and rating count, category tags, explicit flag, cover art, total episode count) and, by default, the episode list (id, url, title, publish date, duration, description, explicit/video flags, 30-second mp3 preview URL). The episode list is paginated internally via the page's GraphQL API up to `--limit` (max 100). Optionally returns the page's "More like this" show recommendations.

Runs in a browser context (Spotify's GraphQL API is not anonymously callable); browsing public shows needs no login.

## Parameters

| name | type | required | default | description |
|---|---|---|---|---|
| `url` | string | one of `url`/`id` | - | Show page URL, e.g. `https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk` |
| `id` | string | one of `url`/`id` | - | The 22-character show id from the `/show/` URL segment (e.g. `4rOoJ6Egrf8K2IrywzwOMk`); alternative to `--url` |
| `limit` | number | no | `20` | Max episodes to return, 1-100; `partial=true` when the show has fewer episodes than requested |
| `include_episodes` | boolean | no | `true` | Set `false` to fetch metadata only (skip the episode list) |
| `include_related` | boolean | no | `false` | Set `true` to also return the page's "More like this" show recommendations |

## Return Value

```json
{
  "id": "4rOoJ6Egrf8K2IrywzwOMk",
  "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk",
  "title": "The Joe Rogan Experience",
  "publisher": "Joe Rogan",
  "description": "The official podcast of comedian Joe Rogan.",
  "rating": 4.654801039515046,
  "ratingCount": 952752,
  "categories": ["喜剧"],
  "explicit": true,
  "covers": ["https://i.scdn.co/image/ab6765630000f68d913317cdfae64a2585aa0f36", "https://i.scdn.co/image/ab67656300005f1f913317cdfae64a2585aa0f36", "https://i.scdn.co/image/ab6765630000ba8a913317cdfae64a2585aa0f36"],
  "totalEpisodes": 2740,
  "episodes": [
    {
      "id": "2NqAFyrVQXlS3mOfmA4BKi",
      "url": "https://open.spotify.com/episode/2NqAFyrVQXlS3mOfmA4BKi",
      "title": "#2542 - Steve Hilton",
      "date": "2026-08-19T17:00:00Z",
      "duration": 10772201,
      "description": "Steve Hilton is a businessman, political commentator...",
      "explicit": true,
      "isVideo": true,
      "previewUrl": "https://p.scdn.co/mp3-preview/59c4fba7f0ba6bf5ee7d58e9d34c802c6f10a814.mp3"
    }
  ],
  "related": [
    { "id": "0ofXAdFIQQRsCYj9754UFx", "url": "https://open.spotify.com/show/0ofXAdFIQQRsCYj9754UFx", "title": "Stuff You Should Know", "publisher": "iHeartPodcasts", "cover": "https://i.scdn.co/image/ab6765630000f68de8e4f69c2594c76b57b841f5" }
  ],
  "partial": false
}
```

- `episodes` appears only when `include_episodes` is true (default); `related` appears only when `include_related` is true.
- `rating`/`ratingCount` are `null` for shows without a rating.
- `explicit` derives from the EXPLICIT content-rating label; `isVideo` derives from the episode's media types.
- `previewUrl` is the 30-second mp3 preview (only meaningful for audio episodes).
- `partial=true` when the requested episode count exceeds the show's actual episode count (the show ran out of episodes).

## Usage

```bash
# Core: show metadata + 20 episodes
websculpt spotify get-podcast --id 4rOoJ6Egrf8K2IrywzwOMk

# By URL, with more episodes and related recommendations
websculpt spotify get-podcast --url "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk" --limit 50 --include-related

# Metadata only
websculpt spotify get-podcast --id 4rOoJ6Egrf8K2IrywzwOMk --include-episodes false
```

## Common Error Codes

| code | meaning |
|---|---|
| `MISSING_PARAM` | neither `--url` nor `--id` was provided |
| `INVALID_PARAM` | malformed show id / url, or `limit` outside 1-100 |
| `NOT_FOUND` | the show id does not exist on Spotify |
| `BROWSER_ATTACH_REQUIRED` | no attached Chrome/Edge with remote debugging (infrastructure) |
| `COMMAND_TIMEOUT` | the command exceeded the daemon timeout (infrastructure) |
