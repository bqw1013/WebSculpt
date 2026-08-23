# Context

## Precipitation Background (Why This Command Exists)

Command-line networking (node https / curl) cannot reach huggingface.co (curl HTTP 000 timeout). The verified path is the user's browser: navigate once to `https://huggingface.co/spaces` to establish the origin, then use in-page same-origin `fetch`. No existing HF command could filter Spaces by SDK type, keyword, or author; `get-trending` only exposed type/sort and its Spaces branch is folded into this command's scenario.

## Value Assessment

HF Space listing is a common discovery path. This command adds `sdk` (gradio/streamlit/static/docker), `search`, and `author` dimensions, returns structured fields (likes/sdk/tags/createdAt/lastModified/description/title), and chains into `get-space`. Replaces manual browsing and the old `get-trending` Spaces scenario.

## Page Structure

Two data sources, both verified in explore; the sdk path merges both:

1. **API list** (used when `sdk` unset OR `author` set; and as the enrichment source of the sdk path):
   - `fetch('/api/spaces?search=&author=&limit=100')` → JSON array; item keys: `_id, id, likes, trendingScore, private, sdk, tags, createdAt`. No `author`/`models`/`lastModified` in the list item (author derived from id; models/lastModified are detail-API only).
   - The list API **ignores** the `sdk` query param (and `filter`/`library`/`tag`/`library_name` variants). `search` and `author` work. For `sdk`+`author`, author narrows the API result, then items are filtered client-side by the `sdk` field (complete).
   - Top-100 sdk distribution: gradio 72 / static 17 / docker 11 / streamlit 0 → streamlit requires the page source.

2. **Page sdk filter** (PATH 1, when `sdk` set, `author` unset — always used as the base):
   - Since the field-completeness fix (2026-08-09), the command ALWAYS fetches `/spaces?sdk={sdk}[&search={search}]&p=N` SSR pages concurrently (`?p=N` is 0-based, 24 `article` cards/page, verified `?p=1`/`?p=2` distinct). A bad sdk value yields an HTTP 400 response on the page fetch. The old "fast path" (API-only when the top-100 post-filter provided enough) was removed because it silently returned `null` title/description/lastModified at an invisible limit threshold.
   - Card selectors: `article` → `a[href^="/spaces/"]` (filter href to `/^\/spaces\/[^/]+\/[^/]+$/` to exclude `/spaces/launch`), `h4` (display title), header numeric `span` (likes), `footer button` (author), `footer time[datetime]` (lastModified), `main p` (description).
   - Only the `<article>` grid slice of each fetched HTML is parsed (fast). Page cards are the base (title/description/lastModified/author/likes always present); ids overlapping the API top-100 are enriched with `createdAt`/`tags`/`trendingScore`/`sdk`. Ids not in the top-100 (e.g. streamlit) keep card-only fields with those three null. When `search` is set, cards are additionally filtered client-side (id/title/description contains the search string) in case the SSR page ignores `?search=`.
   - Page error classification: HTTP 400 → INVALID_PARAM; HTTP 429 → RATE_LIMITED; HTTP 5xx/403 or network (status 0) → NETWORK_ERROR. If the page source fails but the API top-100 already provides enough items, the command degrades to API-only instead of failing.
   - Origin page for the in-page fetches is a light JSON doc `https://huggingface.co/api/spaces?limit=1` (no heavy page load).

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled (daemon `connectOverCDP`). No login required.
- The daemon's CDP attach is independent of the explore-stage `@playwright/cli` attach; the first daemon attach may trigger a Chrome "allow remote debugging" confirmation dialog.
- Polite pacing: command does random mouse movement, scroll, and random wait before fetches, plus small random sleeps between pagination fetches. Keep it light so a single call stays ≤10s.
- Batch testing note: this command was developed alongside `list-models`, `list-datasets`, and `search` (all browser runtime). Test calls to HF must be serialized with random delays between batches to avoid triggering rate limits.

## Failure Signals

- Invalid `sdk` / `limit` → `INVALID_PARAM` before any network call. `limit` is validated on the raw string with `/^\d+$/` then range 1-100; non-integer strings (`1.5`, `1e3`, `2abc`, `+5`, `" 7"`) are rejected instead of silently parseInt-truncated.
- Bad sdk value rejected by the page → HTTP 400 page → `INVALID_PARAM` (defensive, in addition to the enum check).
- Page HTTP 429 → `RATE_LIMITED` (unless the API top-100 already provides enough items, in which case the command degrades to API-only).
- Page HTTP 5xx / 403 / network failure (status 0) → `NETWORK_ERROR` (unless the API top-100 already provides enough items, in which case the command degrades to API-only).
- Zero cards on the sdk page and no API overlap → `EMPTY_RESULT`.
- API non-200 or unparseable body → `NETWORK_ERROR` (message includes server error text and status).
- No browser attached → daemon returns `BROWSER_ATTACH_REQUIRED`.

## Repair Clues

- If the Space card structure changes, update the extraction inside the PATH 1 `page.evaluate` (article/h4/header-span/footer-button/footer-time/main-p selectors) and re-verify the `/^\/spaces\/[^/]+\/[^/]+$/` href filter.
- If `/api/spaces` list item keys change, update the PATH 2 map in `command.js` and the enrichment map in PATH 1.
- If the sdk page pagination param changes (currently `?p=N`), update `PAGE_SIZE` and the fetch URL in PATH 1.
- Field-nullability contract (must stay in sync with manifest/README): on the sdk path (PATH 1), `title`/`description`/`lastModified`/`author`/`likes` come from the pages and are always present; `createdAt`/`tags`/`trendingScore` come from the API top-100 and are null for spaces outside it (e.g. most streamlit). On the API-only path (PATH 2), `title`/`description`/`lastModified` are always null (list API does not expose them). Do NOT reintroduce a fast path that skips pages when the API top-100 provides enough — it silently degrades these fields.
- If HF starts returning a login wall or CAPTCHA HTML instead of JSON/HTML cards, the fetch body will fail to parse → `NETWORK_ERROR`/`EMPTY_RESULT`; consider a longer random backoff between calls.
