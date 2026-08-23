# twitch/get-clip

Fetch details of a single Twitch clip by URL or bare slug, using Twitch's internal GraphQL endpoint. No login, no browser.

## Description

Clips are short (up to ~60s) highlight snippets cut from live streams by viewers. This command returns the full detail record of one clip: title, canonical clip URL, owning channel, game/category, view count, clipper (the viewer who created it), duration, creation date, thumbnail, and the source broadcast reference when available.

- Data source: `POST https://gql.twitch.tv/gql` with the `ShareClipRenderStatus` persisted query and the public web Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko`.
- The clip's chat/discussion is a real-time message stream and is intentionally not included.
- Nonexistent or deleted slugs return HTTP 200 with `data.clip = null`; the command translates this to a `NOT_FOUND` error.

## Parameters

- `url` (required): Full clip URL or bare clip slug.
  - Full URL: `https://www.twitch.tv/lck/clip/ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev`
  - Bare slug: `ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev`
  - The channel segment is irrelevant (the slug is the unique identifier); a trailing `?range=` query string is stripped automatically.

## Return Value

```json
{
  "title": "string",
  "url": "string",
  "channel": { "name": "string", "url": "string" },
  "category": { "name": "string", "slug": "string" } | null,
  "views": "number",
  "clipper": { "name": "string", "url": "string" } | null,
  "duration": "number",
  "createdAt": "string",
  "sourceVideoUrl": "string | null",
  "thumbnailUrl": "string"
}
```

- `duration` is in whole seconds.
- `createdAt` is an ISO 8601 timestamp (e.g. `2026-08-12T08:47:45Z`).
- `sourceVideoUrl` links to the source VOD when the clip has an accessible source broadcast (`https://www.twitch.tv/videos/{id}`); it is `null` when the source is unavailable (not saved, deleted, or subscriber-only). Sampled clips frequently have `null`.

## Usage

```
websculpt twitch get-clip --url "https://www.twitch.tv/lck/clip/ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev"
websculpt twitch get-clip --url "ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev"
```

## Common Error Codes

- `MISSING_PARAM` — the `url` parameter was not provided.
- `INVALID_URL` — the provided value is not a recognizable clip URL or slug.
- `NOT_FOUND` — the slug does not exist (Twitch returns `data.clip = null`).
- `RATE_LIMITED` — Twitch rate-limited the request (HTTP 429).
- `DRIFT_DETECTED` — unexpected HTTP status, unparseable response, response structure change, or a stale persisted-query hash.
