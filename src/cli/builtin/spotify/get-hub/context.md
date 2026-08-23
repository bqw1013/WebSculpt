# Context

## Precipitation Background (Why This Command Exists)

Spotify's podcast hub (`/genre/0JQ5DArNBzkmxXHCqFLx2J`) is the editorial shelf aggregator — the natural starting point for podcast discovery on the platform. The Spotify command family is brand-new (no commands existed before this pool). `get-hub` returns the hub's shelf structure with item cards. Feed its `url`/`id` values into `spotify/get-podcast`, `spotify/get-episode`, `spotify/list-categories`, or `spotify/get-category` for details.

## Value Assessment

- One command returns the whole hub structure (all shelves + item cards) in a single call, replacing manual browsing.
- Same extraction pattern (component-shelf + card anchors) is shared by the sibling shelf commands (`list-new-releases`, `get-category`, `get-podcast-chart`), so fixes here propagate understanding across the pool.
- High generality: adapts to whatever shelves exist (currently just Categories; editorial shelves may return later).

## Page Structure

- URL: `https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2J`.
- React SPA; page HTML is an app shell (no SSR data). Data is fetched in-page via `api-partner.spotify.com/pathfinder/v2/query` with the browser session's token; DOM extraction is the command's extraction path.
- Shelf container: `section[data-testid=component-shelf]`; shelf title in `h2/h3`; "show all" link in `[data-testid=rich-title-row-shelf-header] a` (or a text-matched `See all/查看所有` link inside the shelf).
- Item cards: `<a>` links with `/show/{id}` (podcast), `/episode/{id}` (episode), `/genre/{id}` (category). Card title from `aria-label`, else the card's first `span`, else `img alt`. Cover from the card `img` (`currentSrc`/`src`); subtitle is the card's second distinct span (null when absent).
- Scroll container: `.main-view-container__scroll-node` (fallback `main`). Shelves lazily render on scroll; the command scrolls progressively (1.5 viewport heights per step) then jumps to the bottom.
- Header title testid: `entityTitle` ("Podcasts"/"播客").
- Confirmed 2026-08-20 (daemon browser context): one shelf "Categories" with 9 category cards — Educational, Documentary, Comedy, Pop Culture, Fitness & Nutrition, Celebrities, Video games, Film, Books (each `/genre/{id}`); no editorial shelves and no language filter. The shelf name and category titles are localized (English in the tested daemon context; Chinese in zh-HK).
- Verified cover behavior: 6 category cards render a real `<img>` cover (i.scdn.co URLs); 3 cards (Fitness & Nutrition, Video games, Books) render as solid-color tiles with NO `<img>` — `cover: null` is correct for them, not an extraction failure.

## Environment Dependencies

- Requires the user's Chrome with remote debugging enabled (daemon `connectOverCDP`); first attach may show the system "Allow remote debugging" prompt and needs a click.
- No login required for public browsing, but the attached Chrome's logged-in state is reused if present.
- Anonymous access is blocked (get_access_token 403, api/token 400, anonymous pathfinder 401) — the command must run in a browser context; never degrade to node.
- Polite pacing: keep random delays between navigation/scroll actions (the command uses 350-500ms random waits); avoid repeated rapid reloads.

## Failure Signals

- `EMPTY_RESULT` (thrown): no `section[data-testid=component-shelf]` found after scrolling — page redesign or content failed to render. The error message carries a page-state JSON (URL, title, h2 list, main text head) for diagnosis.
- Zero items in a shelf while the shelf heading exists: card anchor selectors changed.
- Anonymous pathfinder errors (401/403) or empty app-shell HTML when run under the wrong runtime.

## Repair Clues

- If `component-shelf` no longer exists, fall back to scanning `main` for any heading + anchor-list region; or switch to capturing the pathfinder GraphQL responses (hook `page.on('request')`/`('response')` for `pathfinder/v2/query`, read `operationName` + response JSON).
- The hub URL is stable but reachable via `/genre/podcasts-web` (302) — repair can use either.
- The Categories shelf's "see all" target is `/genre/0JQ5DArNBzkmxXHCqFLx2U` (all-categories page) — if the hub shelf changes, the command can fall back to it.
- If the daemon reports `BROWSER_ATTACH_REQUIRED` repeatedly, the Chrome CDP service may be degraded (see pool memory: restart Chrome, keep the shared daemon untouched).
