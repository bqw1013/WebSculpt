# Evidence: techcrunch/list-podcast-episodes

This document records the research and validation evidence for the `techcrunch/list-podcast-episodes` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows existing commands `techcrunch/get-latest` and `techcrunch/get-article` (user source, node runtime, no browser, no login). No name conflict with `techcrunch/list-podcast-episodes`.
- Source plan: the command-family plan, section "7. list-podcast-episodes" (treated as design suggestion, not strict contract). It proposed two candidate data sources — the All Episodes HTML block on `/podcasts/{show}/` with classic pagination `/podcasts/{show}/page/N/`, or the public RSS `/podcasts/{show}/feed/`.
- Contract consulted: the node runtime contract before drafting `command.js`.
- All data-source facts below were re-verified first-hand with curl on 2026-08-14 (not assumed from the plan). The chosen source is a third option discovered during verification: the WordPress REST API's `tc_podcast` post type, which the plan did not mention.

## Verified URLs

- https://techcrunch.com/podcasts/ (podcasts index; shows Build Mode / Equity / StrictlyVC Download)
- https://techcrunch.com/podcasts/equity/ (All Episodes HTML block; 30 cards/page, title + url + datetime + authors, NO description, NO audio)
- https://techcrunch.com/podcasts/equity/page/2/ (HTML pagination works, HTTP 200, 30 cards)
- https://techcrunch.com/podcasts/equity/feed/ (RSS; 20 items, title/link/pubDate/description-excerpt/dc:creator, NO audio enclosure, NO content:encoded)
- https://techcrunch.com/podcasts/equity/feed/page/2/ (RSS pagination path → HTTP 404)
- https://techcrunch.com/podcasts/equity/feed/?paged=2 (RSS pagination via query param → HTTP 200, 18 items, `<title>Equity Archives | Page 2 of 56</title>`; pages 3-5 each 20 items)
- https://techcrunch.com/wp-json/wp/v2/types/tc_podcast (custom post type exposed; rest_base `tc_podcast`, name "Podcast Episodes", has_archive `podcasts`)
- https://techcrunch.com/wp-json/wp/v2/taxonomies/tc_podcast_type (taxonomy "Podcast Types", rest_base `tc_podcast_type`, applies to type `tc_podcast`)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast_type?slug=equity (term lookup → id 577244973, name "Equity", count 1109)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast_type?slug=build-mode&_fields=id,name,count (id 577369913, "Build Mode", 27)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast_type?slug=strictlyvc-download&_fields=id,name,count (id 577278712, "StrictlyVC Download", 70)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=577244973&per_page=100&page=1&_fields=id,date,link,title,yoast_head_json.description,content.rendered (chosen endpoint; 100 items, X-WP-Total: 1109, X-WP-TotalPages: 12)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=577369913&per_page=100&_fields=id,title (27 items)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=577278712&per_page=100&_fields=id,title (70 items)
- https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=equity&per_page=3 (filter by slug → HTTP 400 `rest_invalid_param`: "tc_podcast_type is not a valid Term ID List")
- https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=577244973&per_page=3&_fields=id,date,link,title (filter by term id → HTTP 200, X-WP-Total: 1109)
- https://techcrunch.com/podcast/why-sandbar-thinks-its-voice-enabled-ring-can-avoid-the-ai-hardware-graveyard/ (episode detail page; audio embedded via Megaphone iframe, no direct .mp3 in HTML)

## Structural Evidence

### Data source decision (API vs RSS vs HTML)

Three candidate sources were verified. The WordPress REST API `tc_podcast` post type was chosen because it is the only one that is simultaneously structured, paginated to 100/page, and rich enough to fill every output field:

| Source | title | url | date | description | audioUrl | pagination |
|---|---|---|---|---|---|---|
| WP REST API `tc_podcast` | yes | yes | yes (ISO) | yes (`yoast_head_json.description`) | yes (Megaphone embed URL) | `per_page` up to 100 |
| RSS `/feed/` | yes | yes | yes (pubDate) | yes but truncated (`[...]`) | no (no `<enclosure>`) | `?paged=N` (uneven page sizes) |
| HTML All Episodes block | yes | yes | yes (datetime attr) | no | no | `/page/N/` (30 cards/page) |

- RSS was rejected because it carries no audio enclosure and page 2 of the feed returned an odd 18 items (pages 1/3/4/5 returned 20). RSS would leave `audioUrl` unfillable.
- HTML was rejected because cards contain no description and no audio URL; parsing class-based HTML is also more drift-prone than a structured JSON API.
- The REST API was chosen: structured JSON, verified stable, public (no auth, no browser), and consistent with the existing `techcrunch/get-article` / `techcrunch/get-latest` commands which also use the WordPress REST API.

### Endpoints

1. Show slug → term resolution:
   - `GET /wp-json/wp/v2/tc_podcast_type?slug={show}&_fields=id,name,count`
   - Returns an array with one term: `{ id, name, count, slug, ... }`. Empty array means the show slug is unknown.
   - Verified term IDs: equity → `577244973` (name "Equity", count 1109), build-mode → `577369913` (name "Build Mode", count 27), strictlyvc-download → `577278712` (name "StrictlyVC Download", count 70).
2. Episodes list:
   - `GET /wp-json/wp/v2/tc_podcast?tc_podcast_type={termId}&per_page={n}&page=1&_fields=id,date,link,title,yoast_head_json.description,content.rendered`
   - `tc_podcast_type` filter ONLY accepts term IDs (a slug triggers HTTP 400 `rest_invalid_param`, verified).
   - `per_page` cap is 100; verified 100 items returned for equity. `per_page=100` on a small archive (build-mode 27, strictlyvc 70) returns the full archive.
   - `X-WP-Total` response header = total episodes for the show; `X-WP-TotalPages` = `ceil(total / per_page)`.
   - Dotted `_fields` notation works and keeps the payload minimal: the response contains exactly `{ id, date, link, title:{rendered}, yoast_head_json:{description}, content:{rendered} }` (verified by inspecting object keys). Full-object responses (~8 KB/episode) are avoidable.

### Episode field mapping

- `title.rendered` — HTML-encoded title (e.g. `&#8217;` for apostrophes, `&#038;` for `&`). Decode to plain text.
- `link` — canonical episode URL `https://techcrunch.com/podcast/{slug}/`.
- `date` — ISO string `YYYY-MM-DDTHH:MM:SS` (site local time, no offset).
- `yoast_head_json.description` — clean one-sentence episode summary; present on every sampled episode. Best `description` source.
- `content.rendered` — full show-notes HTML. Always contains a Megaphone player iframe on sampled episodes (100/100 on the first page of equity). The audio URL appears in two observed forms:
  - `https://playlist.megaphone.fm?e=TCML...` (no slash before `?`)
  - `https://playlist.megaphone.fm/?e=TCML...` (slash before `?`)
  - Regex `/https:\/\/playlist\.megaphone\.fm\/?\?e=[A-Z0-9]+/i` matches both; it also stops before any trailing `%20` whitespace-encoding observed in some `src` attributes.
- No direct `.mp3` URL exists in the API, RSS, or list HTML; `audioUrl` is the Megaphone embed/player URL (the same URL the episode page plays).

### Output contract (per approved plan, implemented as object wrapper)

`{ show: {slug, name, episodeCount}, episodes: Array<{title, url, date, description, audioUrl}>, count, partial }`
- `partial` is `true` when the archive is exhausted before reaching `limit` (e.g. limit=50 on build-mode returns 27 with partial=true); `false` when `limit` was fully satisfied.
- Because `limit <= 100 = per_page cap`, a single `per_page=limit` request always covers the requested range; no multi-page loop is needed.

## Failure Signals

- HTTP 200 + non-array body on either endpoint → `DRIFT_DETECTED` (response shape changed).
- Non-2xx from the API → `API_ERROR` with the status code.
- Network failure / fetch throw → `NETWORK_ERROR`.
- Term lookup returns an empty array → `NOT_FOUND` (the show slug no longer resolves server-side).
- Invalid `show` (not one of the three enum values) or invalid `limit` (NaN, non-integer, <1, >100) → `INVALID_PARAM` thrown BEFORE any network request, per design guidelines.
- A valid show with zero episodes is a legitimate success state: `{ episodes: [], count: 0, partial: true }` — NOT an error.
- Polite pacing: the API is public and stable, but the command sleeps a random 200-700 ms before each request and makes at most 2 requests per invocation (term lookup + episodes), keeping cadence moderate. 8 TechCrunch commands may run concurrently against the same site, so the sleep is intentional.
- Rate limiting was not observed during verification (many rapid requests over ~1 minute returned HTTP 200 with no 429/403). Behavior under sustained parallel burst is still tested during capture.

## Capture Assessment

Captured as `techcrunch/list-podcast-episodes`: it lists episodes of the three TechCrunch podcasts (Equity, Build Mode, StrictlyVC Download), a content form not covered by existing commands (`get-latest` covers the article feed, `get-article` fetches a single article). The command reuses the verified public WordPress REST API channel with the `tc_podcast` custom post type and `tc_podcast_type` taxonomy. Node runtime, no auth, no browser. Output is a flat array of episode cards (`title, url, date, description, audioUrl`) plus `partial` when the archive is exhausted — matching the approved contract. Proceed to capture.
