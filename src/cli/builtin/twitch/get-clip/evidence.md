# Evidence: twitch/get-clip

This document records the research and validation evidence for the `twitch/get-clip` command.

## Exploration Path

- Command library check: `websculpt command list twitch` shows a single existing command `twitch/search` (browser runtime, no login). No single-clip detail command exists. `twitch/get-clip` is a new command.
- Browser path verified with Playwright CLI (`@playwright/cli` v0.1.13) attached to the user's Chrome; read the browser automation guide before use.
  - Visited `https://www.twitch.tv/lck/clips` (auto-appends `?range=7d`), extracted 40 clip card links confirming detail URL shape `/{channel}/clip/{slug}`.
  - Navigated to two real clip detail pages and inspected DOM + captured GraphQL traffic.
  - Confirmed og meta is site-generic and NOT usable for clip details; no JSON-LD.
- Runtime probe: node fetch direct call to `https://gql.twitch.tv/gql` with the public web Client-ID works with no auth token and no cookies.
  - 5-call burst (no sleep) and 12-call sequential (random 200-700 ms sleep) all returned HTTP 200, no 429, no rate-limit headers.
  - Information content is identical to the browser response, so runtime is determined as **node** (differs from the plan's browser assumption; re-verified by the coordinator against the node criteria).

## Verified URLs

- `https://www.twitch.tv/lck/clips` (channel clips list page; URL auto-carries `?range=7d`)
- `https://www.twitch.tv/lck/clip/ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev` (real clip detail page, title "DisasteEeEer")
- `https://www.twitch.tv/lck/clip/TenuousTameHippoOSfrog-xHjqbjEM3B5xcZ5C` (second real clip detail page, title "Kanavi Flash W Ambessa instead of the Seraphine")
- `https://gql.twitch.tv/gql` (internal GraphQL POST endpoint; public Client-ID, no login)

## Structural Evidence

Primary data source is the GraphQL operation `ShareClipRenderStatus` (persisted query hash `552c19362ba6033f564e5e25ba9c6e4f5b34cd3a734ba69e5ed61c7ab0d439b9`), variables `{ "slug": "<clip-slug>" }`.

Request (HTTP POST `https://gql.twitch.tv/gql`, headers `Content-Type: application/json`, `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko`):

```json
[{"operationName":"ShareClipRenderStatus","variables":{"slug":"<slug>"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"552c19362ba6033f564e5e25ba9c6e4f5b34cd3a734ba69e5ed61c7ab0d439b9"}}}]
```

Response shape (real sample):

```json
{"data":{"clip":{
  "id":"2646610247","slug":"ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev",
  "url":"https://www.twitch.tv/lck/clip/ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev",
  "title":"DisasteEeEer","viewCount":464,"language":"EN",
  "curator":{"id":"38153281","login":"ilidas","displayName":"Ilidas"},
  "game":{"id":"21779","name":"League of Legends","displayName":"League of Legends","slug":"league-of-legends"},
  "broadcast":{"id":"315433908208","title":null},
  "broadcaster":{"id":"124425501","login":"lck","displayName":"LCK"},
  "thumbnailURL":"https://static-cdn.jtvnw.net/twitch-video-assets/.../thumb-0000000000-1920x1080.jpg",
  "createdAt":"2026-08-12T08:47:45Z","duration":16.73,"durationSeconds":16,
  "video":null,"videoOffsetSeconds":null
}}}
```

Field mapping (command output):
- `title` <- clip.title
- `url` <- clip.url (canonical clip URL)
- `channel` <- clip.broadcaster: `{ name: displayName, url: "https://www.twitch.tv/" + login }`
- `category` <- clip.game: `{ name: displayName, slug }` (nullable)
- `views` <- clip.viewCount
- `clipper` <- clip.curator: `{ name: displayName, url: "https://www.twitch.tv/" + login }` (nullable)
- `duration` <- clip.durationSeconds (integer seconds)
- `createdAt` <- clip.createdAt (ISO 8601)
- `sourceVideoUrl` <- clip.video is non-null ? `"https://www.twitch.tv/videos/" + video.id` : null (nullable; sampled clips all null)
- `thumbnailUrl` <- clip.thumbnailURL

Edge behavior:
- Nonexistent or empty slug: HTTP 200 with `data.clip = null` (not an HTTP error). Command must translate to NOT_FOUND.
- Slug is the true identifier: the channel segment in the URL is irrelevant; a bare slug works.
- Without `Client-ID` header: HTTP 400 "The Client-ID header is missing".

## Failure Signals

- `data.clip === null` with HTTP 200 → clip does not exist (nonexistent/deleted slug). Report NOT_FOUND.
- HTTP 400 from gql → missing/invalid `Client-ID` header (CLIENT_ID drift).
- HTTP 429 → Twitch rate limiting; command must fail with a clear error (not observed during probe).
- HTTP 5xx, non-JSON body, missing `clip` key, or `errors` present in the response → structure/API drift → DRIFT_DETECTED.
- The persisted query `sha256Hash` may change if Twitch updates their GraphQL schema; if the hash goes stale the endpoint returns an error, surfacing as DRIFT_DETECTED.
- viewCount is live and increases over time; the command should not hard-code or expect a fixed value.

## Capture Assessment

This command should be captured. Verified end-to-end: a single HTTP POST to Twitch's internal GraphQL with the public web Client-ID returns the complete clip object (title, URL, channel, category, views, clipper, duration, createdAt, source video reference, thumbnail) without login, cookies, or a browser. The path is simple, stable, and parameterizable by a single `url`/slug input, and it directly complements the planned `twitch/get-channel-clips` list command (its URL output is this command's input). Runtime is node.
