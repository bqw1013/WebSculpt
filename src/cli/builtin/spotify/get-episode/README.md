# spotify/get-episode

Fetch a single Spotify podcast episode (open.spotify.com/episode/{id}) — one installment of a podcast, NOT the podcast itself (use `spotify/get-podcast` for that).

## Description

Returns the episode's title, parent show (id/url/title), publish date, duration (ms), full episode description, explicit flag, video-episode flag, cover art, and the 30-second mp3 preview URL. With `--include-related`, also returns the page's "More like this" episode recommendations.

Runs in a browser context: Spotify's data endpoint (api-partner.spotify.com pathfinder GraphQL) is not anonymously callable, so the command attaches to your Chrome session and reads the page's own GraphQL traffic. Browsing public episodes needs no login.

## Parameters

| name | type | required | default | meaning |
|---|---|---|---|---|
| `url` | string | one-of | - | Episode URL, e.g. `https://open.spotify.com/episode/7CJ7dioRxLKDCIsK2K0c7y`. Mutually exclusive with `--id`. |
| `id` | string | one-of | - | The 22-character episode id from the `/episode/` URL segment. Mutually exclusive with `--url`. |
| `include_related` | boolean | no | false | Set `true` to also return "More like this" episode recommendations. |

`url` / `id` are mutually exclusive — provide exactly one.

## Return Value

```json
{
  "id": "7CJ7dioRxLKDCIsK2K0c7y",
  "url": "https://open.spotify.com/episode/7CJ7dioRxLKDCIsK2K0c7y",
  "title": "#2540 - Travis Barker",
  "show": { "id": "4rOoJ6Egrf8K2IrywzwOMk", "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk", "title": "The Joe Rogan Experience" },
  "date": "2026-08-14T17:00:00Z",
  "duration": 9021247,
  "description": "Travis Barker is a musician, songwriter, producer, ...",
  "explicit": true,
  "isVideo": true,
  "cover": "https://i.scdn.co/image/ab6765630000ba8a7fc72faac40c9288d7641fc5",
  "previewUrl": "https://p.scdn.co/mp3-preview/634836b0b841fe8ea843e3ef4b911cf20f3060d5.mp3",
  "related": [ { "id": "5GAIksG7s6MdT8QbRW1pfD", "url": "https://open.spotify.com/episode/5GAIksG7s6MdT8QbRW1pfD", "title": "Ant Williams", "show": { "id": "2KoFktljFBTV9md7GSML7J", "title": "Conversations with Cornesy" } } ],
  "partial": false
}
```

Field notes:
- `duration` is milliseconds (number).
- `date` is the ISO publish timestamp.
- `explicit` / `isVideo` are booleans (video = `mediaTypes` contains "VIDEO").
- `previewUrl` is the 30-second mp3 preview (anonymous-reachable).
- `partial: true` when `--include-related` was requested but the recommendation shelf did not load, or when only a DOM fallback was available.
- If the episode page loads but GraphQL metadata is missing, the command falls back to DOM extraction for title/show/date/duration/description and marks `partial: true`.

## Usage

```
websculpt spotify get-episode --id 7CJ7dioRxLKDCIsK2K0c7y
websculpt spotify get-episode --url https://open.spotify.com/episode/7CJ7dioRxLKDCIsK2K0c7y --include-related
```

## Common Error Codes

- `MISSING_PARAM` — neither `--url` nor `--id` was provided.
- `INVALID_URL` — `--url` does not contain `/episode/{id}`.
- `INVALID_ID` — `--id` is not a plausible episode id.
- `NOT_FOUND` — the episode does not exist (bad id).
- `NAVIGATION_FAILED` — the episode page could not be loaded.
- `DRIFT_DETECTED` — the page structure changed and neither GraphQL nor DOM extraction found episode content.
- Infrastructure errors (e.g. `BROWSER_ATTACH_REQUIRED`) come from the daemon and mean Chrome is not attached with remote debugging enabled.
