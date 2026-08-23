# Evidence: spotify/get-episode

This document records the research and validation evidence for the `spotify/get-episode` command.

## Exploration Path

Exploration was performed in a prior workspace (assessed 2026-08-20) using an attached browser session; the episode page pathfinder GraphQL responses were captured in the page context.

Independent node-side verification (curl/node, UA=Chrome/131): `/get_access_token?reason=transport&productType=web_player` → 403 URL Blocked; `/api/token` → 400 Unauthorized ("Usage of this endpoint is not permitted under the Spotify Developer Terms..."); `POST https://api-partner.spotify.com/pathfinder/v2/query` without session token → 401 Missing/invalid/expired access token; episode HTML → 200 but Web Player app shell with no SSR data. Conclusion: pathfinder GraphQL cannot be called anonymously; the command must run in a browser context (attach user Chrome, reuse its session to call pathfinder).

## Verified URLs

- https://open.spotify.com/episode/7CJ7dioRxLKDCIsK2K0c7y — tested episode page (JRE #2540 - Travis Barker). Title: "#2540 - Travis Barker - The Joe Rogan Experience | Podcast on Spotify".
- https://api-partner.spotify.com/pathfinder/v2/query — GraphQL endpoint fired by the page in context; responses carry episode metadata and recommendations.
- https://open.spotify.com/get_access_token — 403 URL Blocked anonymously (evidence for browser runtime).
- https://open.spotify.com/api/token — 400 Unauthorized anonymously (evidence for browser runtime).
- https://p.scdn.co/mp3-preview/634836b0b841fe8ea843e3ef4b911cf20f3060d5.mp3 — the episode's 30s preview (previewPlayback.audioPreview.cdnUrl), 200 audio/mpeg 773642 bytes, anonymously reachable.
- https://open.spotifycdn.com/cdn/build/web-player/web-player.13dbebf4.js — web-player main bundle; grep confirmed operation name `getEpisodeOrChapter`.

## Structural Evidence

The episode page fires `pathfinder/v2/query` POST requests in page context. Response bodies are JSON with a single `data` key per request.

1) Episode metadata — response `data.episodeUnionV2` (operation name `getEpisodeOrChapter`, confirmed in web-player bundle). Real sample (key fields, episode 7CJ7dioRxLKDCIsK2K0c7y):

```json
{ "data": { "episodeUnionV2": {
  "__typename": "Episode",
  "id": "7CJ7dioRxLKDCIsK2K0c7y",
  "uri": "spotify:episode:7CJ7dioRxLKDCIsK2K0c7y",
  "name": "#2540 - Travis Barker",
  "description": "Travis Barker is a musician, songwriter, producer...",
  "htmlDescription": "<p>Travis Barker is a musician ...</p>",
  "duration": { "totalMilliseconds": 9021247 },
  "releaseDate": { "isoString": "2026-08-14T17:00:00Z", "precision": "MINUTE" },
  "contentRating": { "label": "EXPLICIT" },
  "contentRatingsV2": { "labels": ["EXPLICIT"] },
  "mediaTypes": ["VIDEO", "AUDIO"],
  "coverArt": { "sources": [
    { "height": 64,  "width": 64,  "url": "https://i.scdn.co/image/ab6765630000f68d7fc72faac40c9288d7641fc5" },
    { "height": 300, "width": 300, "url": "https://i.scdn.co/image/ab67656300005f1f7fc72faac40c9288d7641fc5" },
    { "height": 640, "width": 640, "url": "https://i.scdn.co/image/ab6765630000ba8a7fc72faac40c9288d7641fc5" }
  ]},
  "podcastV2": { "data": {
    "__typename": "Podcast",
    "name": "The Joe Rogan Experience",
    "uri": "spotify:show:4rOoJ6Egrf8K2IrywzwOMk"
  }},
  "previewPlayback": { "audioPreview": { "cdnUrl": "https://p.scdn.co/mp3-preview/634836b0b841fe8ea843e3ef4b911cf20f3060d5.mp3" } },
  "audio": { "items": [ { "url": "https://p.scdn.co/mp3-preview/60c8a3f9c0160607801a89b510adb7b278770e44" }, ... ] },
  "sharingInfo": { "shareUrl": "https://open.spotify.com/episode/7CJ7dioRxLKDCIsK2K0c7y?si=..." },
  "visualIdentity": { "sixteenByNineCoverImage": { "image": { "data": { "sources": [...] } } } },
  "transcripts": { "items": [ { "cdnUrl": "...", "language": "en-us" } ] }
} } }
```

Field mapping (contract basis):
- title = `name`; id from URL segment; url = `https://open.spotify.com/episode/{id}`.
- show = `podcastV2.data` → `{ id: from uri "spotify:show:{id}", url, title: name }`.
- date = `releaseDate.isoString` (ISO string, precision MINUTE).
- duration = `duration.totalMilliseconds` (ms, number).
- description = `description` (plain text; `htmlDescription` is the HTML variant).
- explicit = `contentRatingsV2.labels` contains "EXPLICIT" (also `contentRating.label`).
- isVideo = `mediaTypes` array contains "VIDEO".
- cover = `coverArt.sources` — pick the highest-height entry's url (64/300/640).
- previewUrl = `previewPlayback.audioPreview.cdnUrl` (30s mp3, anonymous 200 audio/mpeg 773642 bytes).
  - NOTE: plan asserted `audio.items[].url` is the 30s preview; verified it is NOT anonymously reachable (all 6 segmented URLs return 404 to anonymous curl). `previewPlayback.audioPreview.cdnUrl` is the working preview URL.

2) "More like this" recommendations — response `data.seoRecommendedEpisode` (real sample):

```json
{ "data": { "seoRecommendedEpisode": {
  "items": [
    { "data": {
        "__typename": "Episode",
        "name": "Ant Williams",
        "uri": "spotify:episode:5GAIksG7s6MdT8QbRW1pfD",
        "duration": { "totalMilliseconds": 2536124 },
        "releaseDate": { "isoString": "2026-05-01T02:41:00Z", "precision": "MINUTE" },
        "mediaTypes": ["AUDIO"],
        "contentRatingsV2": null,
        "coverArt": { "sources": [...] },
        "podcastV2": { "data": {
            "name": "Conversations with Cornesy",
            "uri": "spotify:show:2KoFktljFBTV9md7GSML7J"
        }},
        "sharingInfo": { "shareUrl": "https://open.spotify.com/episode/5GAIksG7s6MdT8QbRW1pfD?si=..." }
    } },
    { "data": { ... "17. Van Neistat (Filmmaker) The Spirited Man's Crash Course on Life", show "LIVE The Outbound Life" ... } }
  ],
  "totalCount": 2
} } }
```

- Related shelf response key is `seoRecommendedEpisode` (NOT the plan's `internalLinkRecommenderEpisode`; the latter is not present in the web-player main bundle). Capture should match on response `data` keys, not operation names.
- Related items may include `__typename: "NotFound"` / `"GenericError"` entries — filter them out.
- item `data` is an Episode entity: `name`, `uri` → id, `podcastV2.data.name/uri` → show, plus coverArt/duration/releaseDate.

3) DOM fallback (browser runtime, secondary path): episode page title contains "{episode} - {show} | Podcast on Spotify". Main content region holds the episode title (h1), a show link (`a[href*="/show/"]`), localized publish date text (e.g. "2026年8月14日" / "Aug 14, 2026"), duration text (e.g. "2小时30分" / "2 hr 30 min"), E explicit badge, video badge, full description (long text block in main), and the "更多同类单集" shelf. Caution: `document.querySelector("h1")` may match the left sidebar "音乐库" heading — scope DOM reads to the `main` region.

## Failure Signals

- Anonymous node/curl to pathfinder → 401 (no access token); `/get_access_token` 403, `/api/token` 400 → command MUST run in browser context. If daemon returns `BROWSER_ATTACH_REQUIRED`, the browser is not attached (remote debugging consent or Chrome restart needed).
- Bad episode id / non-existent episode: page shows a not-found state; GraphQL `episodeUnionV2.__typename` may be `"NotFound"`. Command should throw `NOT_FOUND`.
- Drift: if neither the `episodeUnionV2` GraphQL response nor DOM fallback yields a title after a reasonable wait, throw `DRIFT_DETECTED`.
- Field-level GraphQL errors: trimming fields or invalid variables can produce field-level `errors` instead of a whole-package rejection — validate per-field, don't assume the whole response is valid.
- `page.on("response")` handlers are fire-and-forget: wrap body parsing in try/catch and never let a rejected promise escape (avoids killing the shared daemon).
- Related shelf may not fire for every episode (recommendations can be empty); when `--include-related` is set but no `seoRecommendedEpisode` response arrives, return `partial: true`.

## Capture Assessment

Path is verified and stable: the episode page's own GraphQL (pathfinder `getEpisodeOrChapter` → `data.episodeUnionV2`) provides complete metadata including the 30s preview URL (`previewPlayback.audioPreview.cdnUrl`), and `data.seoRecommendedEpisode` provides "More like this" recommendations. DOM fallback covers date/duration/description. This is a reusable, parameterizable command (input: episode url or id; output: structured episode detail). Capture as `spotify/get-episode`, browser runtime, no login required for public episodes.
