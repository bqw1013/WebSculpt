# Evidence: vimeo/get-trending

This document records the research and validation evidence for the `vimeo/get-trending` command.

## Exploration Path

Command library check: only `vimeo/search` exists in the vimeo domain (browser runtime). No existing command covers the trending block; this is a new command.

Reference plan: the original command plan designated `vimeo/get-trending` as a browser-runtime command that parses the `/watch` homepage DOM. Exploration disproved that: the trending block content is NOT in the SSR HTML and loads lazily via a JWT-protected API. The plan's runtime, data-source and cardinality assumptions were updated accordingly (see Capture Assessment).

Exploration was run under the websculpt-explore skill. Browser automation (Playwright CLI) was used only to confirm the block's existence and lazy-load mechanism, not as the extraction path. The data extraction path is plain node HTTP + JSON.

## Verified URLs

- `https://vimeo.com/watch` — public discovery homepage; SSR HTML returns 200 (~125 KB) containing only a Next.js shell + `viewerBootstrap` JSON (which embeds a `jwt`). No trending content is inlined.
- `https://vimeo.com/watch/trending` — returns 301 to `/watch` (no standalone trending page).
- `https://api.vimeo.com/curation_content/1/curation_components` — lists the `/watch` blocks; the trending block is `/curation_components/2` (title "See what's trending", short_title "Trending", source_type "popular").
- `https://api.vimeo.com/curation_components/2/videos` — the trending videos endpoint. Requires `Authorization: jwt <token>`. Returns `{ total: 2000, page, per_page, paging: { next }, data: [...] }`.

## Structural Evidence

`viewerBootstrap` JSON is embedded in the `/watch` SSR HTML as `<script id="viewer-bootstrap" type="application/json">`. The JWT is at path `viewerBootstrap.jwt` (regex in HTML: `"jwt":"([^"]+)"`). TTL is short (~6 minutes; observed exp values ~4-6 min after issuance). A single JWT suffices for paginating through at least 10 API pages within its TTL.

Trending API endpoint (all query params optional; the following are validated):
- `GET https://api.vimeo.com/curation_components/2/videos?sizes=640&per_page={n}&page={m}&fields={list}`
- Required header: `Authorization: jwt <token>`. A browser `User-Agent` is sent. `Referer` / `vimeo-page` headers are NOT required.
- `per_page` validated up to 100. `total` = 2000; page 201 still returned data (total is informational).
- Minimal validated `fields` subset:
  `name,link,duration,created_time,stats.plays,pictures.sizes.link,user.name,user.link,badge.type`

Response record shape (real sample, first record):
```json
{
  "uri": "/videos/1218608735",
  "name": "ATARASHII GAKKO! - \"TTTTOKYO\" - MV",
  "link": "https://vimeo.com/1218608735",
  "duration": 257,
  "created_time": "2026-08-16T02:34:16+00:00",
  "pictures": { "sizes": [ { "link": "https://i.vimeocdn.com/video/2190607085-...-d_640x480?&r=pad&region=us" } ] },
  "stats": { "plays": 235 },
  "user": { "name": "<creator>", "link": "https://vimeo.com/<creator>" },
  "badge": null
}
```
Mapping to command output: `id` = last segment of `uri`; `title` = `name`; `url` = `link` (clean canonical URL, no `?fl=wc`); `views` = `stats.plays`; `thumbnail` = `pictures.sizes[0].link`; `author` = `{ name: user.name, url: user.link }`; `createdAt` = `created_time`; `badge` = `badge.type`.

Browser DOM consistency: after scrolling the page scroller (`div.css-q9qn58`), the browser fires `curation_components/2/videos` with `per_page=12&page=1` and `page=2` and renders video cards with links `https://vimeo.com/{id}?fl=wc` (the `?fl=wc` is a UI-only tracking param; the API `link` field does not include it). The first 9 of 10 rendered card IDs matched API page-1 IDs exactly; the frontend filtered 2 API records (positions 10-11) from its render window.

## Failure Signals

- 401 with body `{"error":"Something strange occurred. ..."}` when the JWT is missing, malformed, or expired → re-fetch the JWT from `/watch` and retry.
- The JWT expires ~6 minutes after issuance; a run that only makes a handful of requests within seconds never hits this, but the code should re-fetch on a 401 to be robust.
- Network/HTTP failures on `/watch` or the API (non-200, fetch throw) → command error; caller can retry.
- No `?fl=wc` stripping is needed on output because the API `link` field is already clean; if drift ever makes `link` carry extra query params, the output contract expects the clean canonical URL.

## Capture Assessment

Capture as `vimeo/get-trending`, runtime `node`. The path is fully validated: 30 consecutive requests (13 `/watch` fetches + 17 API calls, including a 10-page pagination with one JWT) all returned 200 with no 429/403/Cloudflare/JS-shell/degradation. The API returns strictly more fields than the browser-rendered cards (adds `created_time`, `badge`), so the node path's information content is not less than the browser path. This satisfies the user's hard runtime criteria ("no rate limiting on consecutive calls AND information content not less than browser"). The command is reusable: "what is trending on Vimeo right now" is a recurring discovery query with no login or browser prerequisite.
