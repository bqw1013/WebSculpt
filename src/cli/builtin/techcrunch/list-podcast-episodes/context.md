# Context

## Precipitation Background (Why This Command Exists)

TechCrunch publishes three podcasts (Equity, Build Mode, StrictlyVC Download) alongside its article feed. Existing commands (`techcrunch/get-latest`, `techcrunch/get-article`) cover articles but not podcast episodes. `list-podcast-episodes` fills that gap: given a show slug and a limit, it returns the latest episode cards (title, URL, date, description, audio URL). Designed as part of the 8-command TechCrunch family; contract approved in the command-family plan §7.

## Value Assessment

- Generality: one command covers all three shows via the `show` enum; `limit` adapts to any batch size up to 100.
- Reuse: podcast episodes are a distinct content type users monitor (equity is weekly, 1109 episodes archived). The Megaphone `audioUrl` enables download/transcription workflows not possible from the article commands.
- Time saved: the WP REST API path returns a structured list in 1-2 requests — no HTML scraping, no RSS parsing.

## Page Structure

- Show index: https://techcrunch.com/podcasts/ — lists Build Mode / Equity / StrictlyVC Download.
- Data source (chosen over RSS and HTML — see evidence.md): WordPress REST API.
  - Term lookup: `GET /wp-json/wp/v2/tc_podcast_type?slug={show}&_fields=id,name,count`
    - equity → id `577244973`, strictlyvc-download → `577278712`, build-mode → `577369913`.
  - Episodes: `GET /wp-json/wp/v2/tc_podcast?tc_podcast_type={termId}&per_page={limit}&page=1&_fields=id,date,link,title,yoast_head_json.description,content.rendered`
  - The taxonomy filter requires the numeric term ID (slug → HTTP 400).
  - `X-WP-Total` header = total episodes for the show.
- Episode mapping: `title.rendered` (HTML-encoded), `link` (canonical `/podcast/{slug}/` URL), `date` (ISO), `yoast_head_json.description` (short summary), `content.rendered` (show notes; contains the Megaphone iframe). Audio URL regex: `/https:\/\/playlist\.megaphone\.fm\/?\?e=[A-Z0-9]+/i` (matches both `?e=` and `/?e=` forms; stops before `%20`).

## Environment Dependencies

- Public WordPress REST API; no login, no browser, no cookies.
- Polite pacing: the command sleeps a random 200-700 ms before each request. At most 2 requests per invocation (term lookup + episodes). Keep serial within the command; across the 8-command family, avoid concurrent burst against techcrunch.com.
- No third-party modules — only global `fetch`, `setTimeout`, `URL`-free string building.

## Failure Signals

- `tc_podcast_type` slug filter no longer accepted → episodes request fails; the term-lookup step is unaffected.
- Term lookup returns empty array → show slug renamed/deprecated → `NOT_FOUND`.
- API body not an array → `DRIFT_DETECTED`.
- Non-2xx → `API_ERROR` (e.g. 429 if rate-limited, 404 if endpoint moved).
- Audio URL regex stops matching → `audioUrl` becomes `null` (soft signal; Megaphone embed changed).
- `yoast_head_json.description` absent → `description` becomes `""` (soft signal; Yoast meta removed).

## Repair Clues

- Alternative sources if the API regresses (all verified in evidence.md):
  1. RSS `https://techcrunch.com/podcasts/{show}/feed/?paged=N` — title/link/date/truncated description, but NO audio enclosure.
  2. HTML `https://techcrunch.com/podcasts/{show}/` All Episodes block + `/page/N/` — title/url/datetime only, no description/audio.
- Term IDs can be re-resolved via `GET /wp-json/wp/v2/tc_podcast_type` (list all terms) if the IDs change.
