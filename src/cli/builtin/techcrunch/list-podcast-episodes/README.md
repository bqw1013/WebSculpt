# techcrunch/list-podcast-episodes

## Description

List episodes of a TechCrunch podcast. Powered by the public WordPress REST API (`tc_podcast` post type) — no login and no browser required.

TechCrunch runs three podcasts, reached via **Podcasts** in the site nav, then a show page (`techcrunch.com/podcasts/{show}/`):

| `--show` | 节目 | Show |
|---|---|---|
| `equity` (default) | 创投周谈 | Equity — weekly venture-capital roundtable |
| `build-mode` | 创业实操 | Build Mode — startup tactics |
| `strictlyvc-download` | VC访谈 | StrictlyVC Download — VC interviews |

## Parameters

- `--show` — Podcast show slug: `equity` (default) | `build-mode` | `strictlyvc-download`.
- `--limit` — Maximum number of episodes to return, `1-100`, default `20`. The command fetches the latest episodes from the show's archive in one internal page; when the archive has fewer episodes than the limit it returns everything available and sets `partial: true`.

## Return Value

```json
{
  "show": { "slug": "equity", "name": "Equity", "episodeCount": 1109 },
  "episodes": [
    {
      "title": "Why Sandbar thinks it’s voice-enabled ring can avoid the AI hardware graveyard",
      "url": "https://techcrunch.com/podcast/why-sandbar-thinks-its-voice-enabled-ring-can-avoid-the-ai-hardware-graveyard/",
      "date": "2026-08-12T07:22:00",
      "description": "Sandbar CEO Mina Fahmi joins Equity to discuss...",
      "audioUrl": "https://playlist.megaphone.fm?e=TCML1345657236"
    }
  ],
  "count": 20,
  "partial": false
}
```

- `show.name` is the canonical show name from TechCrunch; `show.episodeCount` is the show's total episode count (`X-WP-Total`).
- `date` is the ISO publish date (`YYYY-MM-DDTHH:MM:SS`, site-local).
- `description` is the short episode summary (Yoast meta description); empty string when absent.
- `audioUrl` is the Megaphone embed/player URL extracted from the episode page (TechCrunch does not expose a direct `.mp3`); `null` when absent.
- `partial` is `true` when the archive was exhausted before reaching `limit`, `false` otherwise.

## Usage

```
websculpt techcrunch list-podcast-episodes
websculpt techcrunch list-podcast-episodes --show equity --limit 30
websculpt techcrunch list-podcast-episodes --show build-mode
websculpt techcrunch list-podcast-episodes --show strictlyvc-download --limit 100
```

## Common Error Codes

- `INVALID_PARAM` — `show` is not one of the three enum values, or `limit` is not an integer in `1-100`.
- `NOT_FOUND` — the show slug no longer resolves on TechCrunch's taxonomy API.
- `NETWORK_ERROR` — network failure talking to the API.
- `API_ERROR` — TechCrunch API returned a non-2xx status.
- `DRIFT_DETECTED` — API response shape changed (e.g. expected array got something else).
