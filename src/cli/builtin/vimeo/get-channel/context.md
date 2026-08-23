# Context

## Precipitation Background (Why This Command Exists)

Vimeo channels are human-curated video collections; the flagship is Vimeo Staff Picks. This is complementary to `vimeo/search` (keyword/algorithm) and `vimeo/get-trending` (popularity). The command-family plan specified a channel command; exploration verified the page structure and node runtime, and the user confirmed the contract on 2026-08-18.

## Value Assessment

- Reusable: any channel slug (`staffpicks`, `premieres`, `bestofstaffpicks`, `thedecade`, user-created like `music`) yields a structured list without login or browser.
- Node runtime: no browser session, no API token, no rate limiting observed (13 consecutive calls all 200).
- Complements `vimeo/search --type channel`, which can discover slugs to feed this command.

## Page Structure

- List page: `https://vimeo.com/channels/{channel}/videos/page:{n}/sort:{sort}/format:detail` — legacy SSR HTML, NO `__NEXT_DATA__`.
- Pagination: path-based `page:N/sort:X/format:Y`; head `<link rel="next" href=".../page:N+1">` signals more pages; 12 cards per page.
- MUST keep `format:detail` in every pagination URL — the default `format:thumbnail` cards lack author/views.
- Channel info: header `<header id="page_header"><h1><a href="/channels/{channel}">Name</a> <span class="sub">/ Videos</span></h1></header>`; description from `<meta name="description">`; stats from sidebar `.super_link_list_title` (0=Videos, 1=Followers, 2=Moderators); owner from `by <a href="/{slug}">Name</a>`; channelId from `data-subject-id`.
- Video card (`format:detail`): `<li id="clip_{id}">` with `.title a` (title + channel-context URL), `.duration` (mm:ss), `.meta` author link (`from <a href="/{userSlug}">`), `<time datetime>` addedAt, `.detail_icons` spans for Views/Likes/Comments (optional), thumbnail `img[src*=vimeocdn]`, `.description`, and `+ More details` link for the canonical `/videos/{id}` URL.
- Author links are user slugs (`/{userSlug}`), not `/user/{id}`.

## Environment Dependencies

- Node runtime with global `fetch`; no third-party imports.
- No login, no browser, no API key. Anonymous `api.vimeo.com/channels/*` returns HTTP 401 and is NOT used.
- Polite pacing: every request is preceded by a random 200–700ms sleep; browser UA/headers are sent.
- Network: direct access to vimeo.com required (no HTTP proxy set; TUN routing is fine).

## Failure Signals

- HTTP 404 or title containing "Page Not Found" → channel retired/unknown (e.g. `bestoftheyear` is now 404 — do not list it as a valid slug).
- No `<link rel="next">` and/or fewer than 12 cards on a page → end of listing (stop pagination).
- Zero `id="clip_*"` on page 1 → EMPTY_RESULT.
- Missing `#page_header h1` → DRIFT_DETECTED (site restructure).
- HTTP 429/403 → rate limit / access denial; slow down and retry later.

## Repair Clues

- If the list page moves to a JS shell (like the channel aggregate page `/channels/staffpicks` already did), node extraction breaks; fall back to re-exploring for a JSON API or switch to a browser runtime.
- The RSS feed `vimeo.com/channels/{channel}/videos/rss` (10 items, no pagination/sort) is a limited fallback for titles/durations/thumbnails but not views/authors.
- Video page `vimeo.com/{id}` and oEmbed (`vimeo.com/api/oembed.json?url=`) can enrich individual items if richer metadata is ever needed.
