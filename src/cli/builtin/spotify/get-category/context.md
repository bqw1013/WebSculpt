# Context

## Precipitation Background (Why This Command Exists)

Spotify's web player is the anonymous-browseable front end for its podcast catalog. The podcast category pages (`/genre/{id}`, e.g. 喜剧 Comedy `0JQ5DAqbMKFNr6gDrHHVKL`) are reached by clicking category cards on the podcast hub (`spotify/get-hub`) or from the all-categories page (`spotify/list-categories`). Category ids are opaque, so a command that turns a genre id/url into the category's name and its top shows is the natural consumer of `spotify/list-categories` output and the feeder for `spotify/get-podcast`.

## Value Assessment

- Turns an opaque genre id (from `spotify/list-categories`) into human-readable category name + top shows, the same browsing step a user does by clicking a category card.
- Reusable across all 40+ podcast categories; parameterized by `genre_id`/`url` and `limit`.
- Complements the already-captured `spotify/get-hub` (hub shelves) and `spotify/get-podcast` (show details).

## Page Structure

- URL: `https://open.spotify.com/genre/{id}`; title e.g. `Spotify – 喜剧`.
- Category name: `h1[class*="encore-text-headline-large"]` (the sidebar h1 like `音乐库` uses a different class).
- Shelves: `section` elements containing an `h2` and card anchors.
  - Theme playlist shelves: cards link to `/playlist/{id}` (e.g. `Laugh out loud`, `Hangout with comedians`, `Internet chaos`, `Iconic duos`).
  - 热门{类别}播客 show shelf: cards link to `/show/{id}`.
- Card: `div[data-encore-id="card"]` > `a[href="/show/{id}"|"/playlist/{id}"]`, title in `[id^="card-title-"]`, subtitle/publisher in `[id^="card-subtitle-"]`, cover `img[data-testid="card-image"]` (`currentSrc`/`src`/`srcset` on `i.scdn.co`).
- Theme playlist shelves are **market/locale dependent**: the 2026-08-20 explore saw them (Laugh out loud / Hangout with comedians / Internet chaos / Iconic duos) on a Chinese-market render, but the current English-market render of the same page shows only the `Popular {类别} podcasts` show shelf (plus a featured-show hero and utility footer). The command returns whatever shelves render; the global card scan (group by nearest preceding h2) captures theme shelves when present.
- Virtualization: the web player removes off-screen shelves from the DOM when scrolling, so theme shelves are captured at the top before scrolling down to load more shows.
- Pagination: scrolling fires the app's own `browsePage` GraphQL with `pagePagination.offset` increments (initial page limit 10; observed growth 10 → 20).

## Environment Dependencies

- Browser runtime (attach user Chrome) — anonymous token endpoints `/get_access_token` (403), `/api/token` (400), and pathfinder (401) are blocked; the page must run its own GraphQL with its session token.
- No login needed for public category pages.
- Polite pacing: random sleeps between scroll steps (200-700 ms); at most 2 navigation attempts and a bounded scroll loop (30 steps).
- The daemon may need the user to accept the "Allow remote debugging" system dialog on first connect.

## Failure Signals

- `title` stays `Spotify – Web Player` and no `section` with `h2` + card anchors renders → transient blank SPA page; the command retries once, then throws `EMPTY_RESULT` with page state.
- `h1[class*="encore-text-headline-large"]` missing → category name falls back to the first shelf name / genre id.
- No `/show/` cards in any section → no show shelf; returns theme shelves only, `partial: false`.
- Card selectors change (no `[id^="card-title-"]` / `img[data-testid="card-image"]`) → cards degrade to `aria-label`/bare `img src`; if no cards at all, `EMPTY_RESULT`.

## Repair Clues

- If the show section stops growing on scroll, re-verify the app's pagination query (`browsePage` vs `browseSection` offsets) with network observation and, if needed, switch to re-issuing `browsePage` in-page (the `spotify/search` command shows the header-capture + re-issue pattern).
- If theme shelves are missed, the `section`-scoped scan may need to be widened (group card anchors by nearest preceding `h2`).
- Consent banner (`#onetrust-accept-btn-handler`) can block bootstrap; `dismissConsent` handles it.
