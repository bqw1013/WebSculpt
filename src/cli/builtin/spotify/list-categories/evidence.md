# Evidence: spotify/list-categories

This document records the research and validation evidence for the `spotify/list-categories` command.

## Exploration Path

Command library check: `websculpt command list spotify` returns no commands; no Spotify command exists anywhere in the library (global grep has no spotify hit). This is a brand-new command.

Explored in a prior workspace (assessed 2026-08-20). Browser automation protocol confirmed. Exploration used a CDP attach session to the user's Chrome.

Decisive runtime finding (independent probe, UA=Chrome/131): `GET https://open.spotify.com/get_access_token?reason=transport&productType=web_player` → HTTP 403 URL Blocked; `GET https://open.spotify.com/api/token` → HTTP 400 Unauthorized ("Usage of this endpoint is not permitted under the Spotify Developer Terms and Developer Policy"); `POST https://api-partner.spotify.com/pathfinder/v2/query` → HTTP 401 Missing/invalid/expired access token. Anonymous GraphQL access is blocked, so the command must run in the browser and reuse the page session token.

## Verified URLs

- `https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2U` — "所有播客类别" (All Podcast Categories) page. Verified: a single page load renders the full 43-category tree in 8 shelves, no pagination, no scrolling.
- `https://api-partner.spotify.com/pathfinder/v2/query` — the SPA's GraphQL endpoint (used in-browser with a session token; anonymous 401). Not required for this command: DOM extraction is the primary and sufficient path.

## Structural Evidence

- The page renders 8 `[data-testid="component-shelf"]` shelves. Each shelf has an `<h2>` group label and a flat grid (`[role="list"]` with `data-testid="grid-container"`) of `[role="listitem"]` cards.
- Every card contains exactly one category link: `a[href="/genre/{genreId}"]`. The 22-character opaque genre id is the `/genre/` path segment.
- Hierarchy convention (verified): the FIRST card in each shelf is the top-level category (`parent: null`); every later card in the same shelf is a child whose `parent` is the first card's name. The DOM is flat — parent/child is NOT encoded by element nesting, only by order within a shelf.
- 43 categories across 8 shelves: 体育和休闲(11) / 商业和科技(5) / 教育(5) / 新闻和政治(2) / 案件类(1) / 游戏(2) / 生活方式和健康(7) / 艺术和娱乐(10). That is 8 top-level + 35 children, max depth 2.
- Card text must be read via `a.textContent` (raw DOM text) with `a.innerText` fallback: below-the-fold cards return empty `innerText` but populated `textContent`.
- Non-category genre links exist and MUST be excluded: the left-nav "浏览播客" link (`/genre/podcasts-web`) and 17 "选择语言" (choose language) filter links also match `a[href*="/genre/"]` but live OUTSIDE the 8 shelves — scoping the query to `[data-testid="component-shelf"]` excludes them.
- The shelf `<h2>` group label can differ from the top-level card name (h2 "体育和休闲" vs card "体育"; h2 "案件类" vs card "真实案件播客"; h2 "生活方式和健康" vs card "生活方式"). Use the card name — it carries a real genreId/URL — not the h2.
- Names are not unique: "电玩" (Video Games) appears under both 游戏 (id `0JQ5IMCbQBLtqWiaa5oQu8`) and 艺术和娱乐 (id `0JQ5DAqbMKFOlzZdhS87Lt`). `genreId` is the primary key.

## Failure Signals

- If no `[data-testid="component-shelf"]` with genre links appears within the wait window → structure drift → `DRIFT_DETECTED`.
- If zero categories are extracted → `EMPTY_RESULT`.
- The page is a heavy SPA; navigate with `waitUntil: "domcontentloaded"` and wait for the shelf selector, not for `load`.
- A cold browser context may briefly show a consent/login interstitial; the command relies on the browser context session (public pages need no login).

## Capture Assessment

Capture as a new browser-runtime command. It is the genre-id discovery entry for `spotify/get-category`: the 22-character ids are opaque and not guessable. The page loads the entire tree in one request (no pagination), and name/genreId/url/parent are all reliably extractable from the DOM. Runtime = browser (anonymous GraphQL access is blocked; the command needs no GraphQL).
