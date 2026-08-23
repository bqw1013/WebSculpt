# Context

## Precipitation Background (Why This Command Exists)

A Pinterest Board is the organizational unit of Pins (a user-curated bookmark folder / album grouping saved Pins by theme, e.g. "All Recipes from Joy Filled Eats" with 8,945 Pins). Users frequently want to batch-pull all Pins on a topic from a board. The command family chains: `search --type board` / `get-user --tab saved` produce board URLs, and `get-board` consumes them. Precipitated from explore `pinterest-get-board` (2026-08-19, user-confirmed contract).

## Value Assessment

High reuse value: the board is the canonical way to batch-read themed content, boards can hold thousands of Pins, and the path (SSR metadata + BoardFeedResource bookmark pagination) is shared with `get-feed` / `get-user --tab created` — a proven, stable pattern. Saves the caller from manually scrolling a huge board.

## Page Structure

- Board URL: `https://www.pinterest.com/<username>/<board-slug>/`.
- SSR metadata selectors:
  - Name: `h1#board-name`
  - Pin count: `[data-test-id="pin-count"]` (text like `8,945 张 Pin 图`; parse digits)
  - Description: `[data-test-id="board-description-container"]` innerText
  - Owner: `[data-test-id="board-header-details"] a[href^="/"]` → href username, innerText displayName
- Pin stream API: `GET /resource/BoardFeedResource/get/?source_url=...&data={"options":{"board_id":"...","board_url":"...","currentFilter":-1,"field_set_key":"react_grid_pin","filter_section_pins":true,"sort":"default","layout":"default","page_size":25,"redux_normalize_feed":true},"context":{}}&_=<ts>`.
  - Response: `resource_response.data` = array of up to 25 items; `resource_response.bookmark` = base64 cursor (null = exhausted). Next page passes `bookmarks:[<cursor>]`.
  - **`data` mixes `type:"pin"` with `type:"story"` recommendation modules** — always filter to `type === "pin"` before accumulating (verified on `/KoffiKat/recipes/`).
  - Pin fields used: `id`, `grid_title`/`title`, `description`, `link`, `domain`, `images.orig.url`, `grid_attribution{username,full_name}` (fallback `pinner`), `videos.video_list` (video detection + HLS url).
- Grid DOM (`[data-test-id="base-board-pin-grid"]`, `[data-test-id="pin"]`) is virtualized — DOM node count stays ~22-25 regardless of scroll; NEVER use it to count progress.

## Environment Dependencies

- Browser runtime; requires a logged-in Pinterest session in the user's Chrome (the API needs session cookies).
- Login is required (authRequired=required). Unauthenticated visits get redirected/limited.
- Polite pacing: random scroll step (1.2-2.0 viewport heights) + random 200-500ms waits. Default limit 20 needs zero scroll (initial load returns 25 Pins). Limit 100 takes ~3 extra loads (~10-15s total).
- Board sections (`filter_section_pins:true`) are flattened into the feed by the API; no special handling.

## Failure Signals

- `/?show_error=true` redirect after goto → board does not exist → throw `NOT_FOUND`.
- `[data-test-id="board-header"]` missing (no redirect) → structure drift → `DRIFT_DETECTED`.
- Board header present but no `BoardFeedResource` response within ~15s and `pinCount > 0` → drift/throttle → `DRIFT_DETECTED`; if `pinCount === 0`, return empty board.
- Stall: scroll loop sees no new Pins for 15 consecutive iterations → stop, return collected Pins with `partial: true` (throttling / rate limiting).
- Throttling: rapid repeated runs of the command (or explore + tests in quick succession) make Pinterest stop returning subsequent feed pages — the initial page (25 Pins) still loads but scroll pages do not. Observed counts degrade run-over-run (73 → 47 → 22 on one board). The command degrades gracefully with `partial: true`; wait a few minutes between heavy runs.
- `is_video` flag is unreliable (observed `false` on video Pins); rely on `videos.video_list` presence.

## Repair Clues

- If `BoardFeedResource` changes field set, re-verify via explore on the board URL and update the `field_set_key` / response mapping in `command.js`.
- If the DOM selector for the header changes, check `[data-test-id="board-header-details"]` / `[data-test-id="board-summary-container"]` alternatives.
- If pin URLs or image URLs change host patterns, verify against a live board feed response.
- Backup entry: the initial SSR `__PWS_DATA__` script tag also carries board context (app-level only, no Pin list); the reliable Pin source remains `BoardFeedResource`.
