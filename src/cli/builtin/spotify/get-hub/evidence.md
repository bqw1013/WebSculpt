# Evidence: spotify/get-hub

This document records the research and validation evidence for the `spotify/get-hub` command.

## Exploration Path

- Library check: `websculpt command list spotify.com` initially returned no Spotify commands (all 9 in the plan were new). During concurrent capture, `spotify/search` and `spotify/zz-chart-probe` were added by sibling agents — no conflict for `get-hub`.
- Explore workspace `spotify-get-hub` audited: `websculpt explore assess spotify-get-hub` → `status: passed` (Confirmation intentionally left unfilled pending page re-verification).
- Read the browser runtime contract `skills/websculpt-capture/references/browser-contract.md`.
- Confirmed the browser automation protocol: attach to the user's Chrome, do not launch a new browser, keep polite pacing, close own tabs, detach own session.
- Independent node-side verification (curl, UA=Chrome/131): `GET /get_access_token?reason=transport&productType=web_player` → **403**; `GET /api/token` → **400**; anonymous `POST api-partner.spotify.com/pathfinder/v2/query` → **401**; `GET /genre/0JQ5DArNBzkmxXHCqFLx2J` → **200** but pure app-shell HTML (genre id appears once, no `__NEXT_DATA__`/SSR data). Conclusion: **browser context required** — page data only available in-page via its own pathfinder GraphQL session token; DOM extraction is the fallback.

## Verified URLs

- https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2J — podcast hub / target page. HTML 200 (app shell). Browser-rendered in zh-HK market (logged-in): header title "播客", one shelf "类别".
- https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2U — "查看所有类别" (view all categories), the hub's category-shelf "show all" link.
- https://api-partner.spotify.com/pathfinder/v2/query — page data GraphQL endpoint (in-page 200; anonymous 401).
- https://open.spotify.com/get_access_token — anonymous 403; https://open.spotify.com/api/token — anonymous 400.
- Category genre ids observed on the hub's 类别 shelf (each `/genre/{id}`): 教育 0JQ5IMCbQBLl5gxKLgufp8, 纪实 0JQ5IMCbQBLjfX9OdDrA5X, 喜剧 0JQ5IMCbQBLyUJhSxhaPc6, 流行文化 0JQ5IMCbQBLm1xnyRGiyzw, 健身和营养 0JQ5IMCbQBLrPWbMv8sBH5, 明星 0JQ5IMCbQBLwyf3yahCa0M, 电玩 0JQ5IMCbQBLtqWiaa5oQu8, 电影 0JQ5IMCbQBLBylyI0RX5u8, 书籍 0JQ5IMCbQBLylMa3DSQsEu.

## Structural Evidence

- Page is a React SPA; data flows through in-page pathfinder GraphQL (operation names for the hub not yet captured — see Failure Signals). DOM extraction is the fallback extraction path.
- Main content testids observed: `entityTitle` (page title "播客"), `infinite-scroll-list`, `section[data-testid=component-shelf]`, `rich-title-row-shelf-header`, `grid-container`.
- Shelf DOM shape: one `<section data-testid="component-shelf">` per shelf; shelf title in `h2/h3`; shelf "show all" link in `[data-testid=rich-title-row-shelf-header] a`; item cards are `<a>` with `/show/`, `/episode/`, or `/genre/` hrefs. Card title from `aria-label` or `[data-testid=card-title]`; cover from card `img` (currentSrc/src/srcset); subtitle from the second text span of the card.
- Main scroll container: `.main-view-container__scroll-node` (or its child). Progressive `scrollTop` stepping is required to trigger lazy-loaded shelves/images.
- **Observed state confirmed by capture re-test (2026-08-20, daemon browser context, network/proxy restored): only ONE shelf "Categories"** rendered on the hub page — 9 category cards (Educational, Documentary, Comedy, Pop Culture, Fitness & Nutrition, Celebrities, Video games, Film, Books), each `/genre/{id}`. **No editorial shelves** (Episodes You Won't Want to Miss / New Show Releases / Gather Round the Campfire) and **no 选择语言 (language) filter** — `languages` detection returns empty. This matches the zh-HK explore observation (which showed the same single shelf as "类别"), confirming the hub now renders only the category shelf regardless of the UI language.
- The shelf name and category titles are localized (English "Categories" in the daemon context; Chinese "类别" in zh-HK).
- locale/market detection (for diagnosis) handles: `document.documentElement.lang`, `navigator.language`, localStorage key `web-player-storage-v2.persistent.locale`, cookies prefixed `sp_market`/`sp_t`.
- Contract is **adaptive and simplified**: the command scrolls to load all shelves and returns whatever shelves exist. No `--language` parameter and no `languages` field (filter confirmed absent). Item `kind` includes `category` for the hub's category cards.

## Failure Signals

- Anonymous access is fully blocked: `/get_access_token` 403, `/api/token` 400, anonymous pathfinder 401 → command must run in browser context (any `BROWSER_ATTACH_REQUIRED` means the daemon's CDP attach failed, not a page error).
- Page HTML is an app shell: if the command runs under `node` runtime it gets no data (empty shell), so browser runtime is mandatory.
- **Drift risk (high)**: the hub page appears redesigned since the 2026-08-17 plan — only the Categories shelf was visible, not the editorial shelves or language filter. If the `component-shelf` selector or `h2/h3` title pattern stops matching, that is `DRIFT_DETECTED`.
- Language filter absence is a real possibility (not just drift): if no control matches `语言|language|locale`, the command must degrade to categories-only and return `languages: []` rather than error.
- Lazy-load: shelves may require scroll to appear; if the scroll container class changes, `DRIFT_DETECTED` on empty shelf list.
- Environment: CDP service can degrade (WebSocket handshake hangs) — previously recovered by the user restarting Chrome. When degraded, commands return `BROWSER_ATTACH_REQUIRED`/timeout, which is infrastructure, not command logic.

## Capture Assessment

Capture is justified: the podcast hub is the entry point for the whole Spotify podcast command family (search/chart/category links all originate here), and no existing command covers it. The command is implemented adaptively so it returns the real shelf structure (confirmed: a single Categories shelf; editorial shelves may appear later) with item cards (kind/id/url/title/subtitle/cover). The language filter was confirmed absent, so `--language`/`languages` are removed from the contract — a documented difference from the original plan. All facts above were verified by independent curl probes and in-browser DOM observation, and the installed command passed real daemon execution.
