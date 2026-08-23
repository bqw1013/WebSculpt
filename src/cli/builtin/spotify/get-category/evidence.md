# Evidence: spotify/get-category

This document records the research and validation evidence for the `spotify/get-category` command.

## Exploration Path

- Read the shared Spotify command instructions and the explore guide. For browser automation: browser automation protocol confirmed.
- Command library check: no spotify commands existed at explore time; `get-category` is new. The first batch of the same pool has since captured `spotify/get-hub`, `spotify/get-podcast`, `spotify/search`, etc.; `get-category` reuses their established browser-runtime patterns (card DOM extraction, scroll-triggered lazy loading, page-context GraphQL).
- Explored in a prior workspace (assessed 2026-08-20).
- Independent node-side verification (curl, anonymous, UA=Chrome/131): `GET /get_access_token?reason=transport&productType=web_player` → 403 URL Blocked; `GET /api/token` → 400 Unauthorized; `POST https://api-partner.spotify.com/pathfinder/v2/query` (no token) → 401. All anonymous token endpoints and pathfinder are blocked → browser runtime required.

## Verified URLs

- https://open.spotify.com/genre/0JQ5DAqbMKFNr6gDrHHVKL (Comedy category page; the real extraction target)
- https://api-partner.spotify.com/pathfinder/v2/query (pathfinder GraphQL; used in-page by the web player with the session token)

## Structural Evidence

- Page title example: `Spotify – 喜剧`. The category name is in `h1[class*="encore-text-headline-large"]` (the page also has a sidebar h1 like `音乐库`, so the headline-large class disambiguates).
- Shelf layout (h2 headings observed): four theme playlist shelves (`Laugh out loud`, `Hangout with comedians`, `Internet chaos`, `Iconic duos`) whose cards link to `/playlist/{id}`, followed by a `热门{类别}播客` (e.g. `热门喜剧播客`) show section whose cards link to `/show/{id}`; a `Tailored Advertising Opt-out` footer link is ignored.
- The web player virtualizes the page: after scrolling down, top theme shelves are removed from the DOM, so theme shelves must be extracted before deep scrolling.
- Show/playlist card structure: `div[data-encore-id="card"]` containing `a[href="/show/{id}"]` or `a[href="/playlist/{id}"]`, title text in `[id^="card-title-"]`, subtitle (publisher / description) in `[id^="card-subtitle-"]`, cover `img[data-testid="card-image"]` with `src` on `i.scdn.co` (also `currentSrc`/`srcset`).
- Real sample (first cards of 热门喜剧播客): 勵志鷹(@laichieagle), The Joe Rogan Experience(Joe Rogan), Rotten Mango(Stephanie Soo), 講講吓唔記得(@nggayduck), 齋傾唔做(齋老味), Hey Tablo(Team Epikase), Conan O'Brien Needs A Friend(Team Coco & Earwolf), 講經Talkshit(明哥和一發), MoreAliA, The Romesh Ranganathan Show(Ranga Bee & Platform Media), SmartLess, Bad Friends(7EQUIS).
- Pagination: initial page load fires `browsePage` GraphQL `{pagePagination:{offset:0,limit:10}}`; scrolling the show section grows the card count (observed 10 → 20), i.e. the app re-issues browsePage with increasing offset. Genre ids are opaque (e.g. `0JQ5DAqbMKFNr6gDrHHVKL`), discovered via `spotify/list-categories`.
- GraphQL request headers captured in-page include `authorization` (Bearer), `client-token`, `app-platform: WebPlayer`, `spotify-app-version`; the `search` command uses the same header-capture pattern.

## Failure Signals

- Anonymous token endpoints and pathfinder: 403/400/401 (must run in browser context).
- Transient "Something went wrong" / blank SPA page after repeated rapid loads: reload-and-retry up to 2 times with back-off.
- Page structure drift: category h1, card selectors, or the show shelf missing → `DRIFT_DETECTED` / `EMPTY_RESULT`.
- Browser not attached: runner returns `BROWSER_ATTACH_REQUIRED` (infrastructure error, not thrown by command code).
- Polite pacing: random sleeps between scroll steps (200-700 ms) and limited retry count.

## Capture Assessment

Yes. `spotify/get-category` is a reusable, parameterizable path: given any genre page URL or genre id, return the category name, theme playlist shelves and the top-shows shelf (id/url/title/publisher/cover), paginating the show section internally up to `--limit`. Genre ids are opaque and come from `spotify/list-categories`, so this command is the natural companion that consumes those ids. It complements the already-captured `spotify/get-hub` (podcast hub) and `spotify/get-podcast` (show details). The path was verified end-to-end in the explore phase.
