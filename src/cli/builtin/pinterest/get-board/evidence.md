# Evidence: pinterest/get-board

This document records the research and validation evidence for the `pinterest/get-board` command.

## Exploration Path

- Explore verified on 2026-08-19 (assess passed, user confirmed contract).
- Command library check: `pinterest/search` exists only; `pinterest/get-board` is a new command (no name conflict).
- Browser exploration used `@playwright/cli` (not daemon), attached to the user's real Chrome (logged-in Pinterest session).
- The Board page is SSR-rendered; the Pin stream lazily loads via `BoardFeedResource` (bookmark pagination) on scroll. Verified: board metadata extraction from stable DOM selectors, BoardFeedResource request/response shape, scroll-triggered pagination, DOM virtualization, board exhaustion (bookmark null), NOT_FOUND redirect, and video Pin media shape.

## Verified URLs

- https://www.pinterest.com/joyfilledeats/all-recipes-from-joy-filled-eats/ (large board, 8,945 Pins; SSR metadata + BoardFeedResource initial batch + scroll pagination to 100 Pins verified)
- https://www.pinterest.com/KoffiKat/recipes/ (board with video Pins; video media shape verified)
- https://www.pinterest.com/minimadthings/paper-crafts/ (small board, 75 Pins shown; exhaustion / partial=true verified; feed returned 73 unique Pins then bookmark null)
- https://www.pinterest.com/thisuserdoesnotexist12345/thisboarddoesnotexist67890/ (nonexistent board → redirects to https://www.pinterest.com/?show_error=true)
- https://www.pinterest.com/joyfilledeats/this-board-does-not-exist-xyz/ (existing user, nonexistent board → same redirect)

## Structural Evidence

Board page `https://www.pinterest.com/<username>/<board-slug>/`:
- Board name: `h1#board-name` innerText.
- Pin count: `[data-test-id="pin-count"]` innerText, format `8,945 张 Pin 图` (parse digits). Also `[data-test-id="board-count-info"]` / `[data-test-id="board-summary-container"]`.
- Description: `[data-test-id="board-description-container"]` innerText (full text; visual 2-line clamp does not truncate innerText).
- Owner: `[data-test-id="board-header-details"] a[href^="/"]` → href `/joyfilledeats/` (username) and innerText (displayName).
- NOT_FOUND: nonexistent board URL client-side redirects to `https://www.pinterest.com/?show_error=true`. Detect by `page.url()` containing `show_error=true` after a short settle wait. `[data-test-id="board-header"]` is absent on error.

BoardFeedResource API (auto-fired on initial load, no scroll needed for first 25 Pins):
- Endpoint: `GET https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=...&data={"options":{"board_id":"<id>","board_url":"<path>","currentFilter":-1,"field_set_key":"react_grid_pin","filter_section_pins":true,"sort":"default","layout":"default","page_size":25,"redux_normalize_feed":true},"context":{}}&_=<ts>`
- Response: `resource_response.endpoint_name="v3_board_pins"`, `data: array[25]`, `bookmark: string | null` (cursor). Subsequent pages send `bookmarks:[<prevBookmark>]` (array).
- Each page returns 25 unique Pins, no cross-page duplicates (verified 175 Pins / 175 unique across 7 pages).
- Exhaustion: final response `bookmark: null` and `data` shorter than 25 (verified 22+25+25+1=73 then null on a 75-Pin board).
- Board sections (`filter_section_pins:true`) flatten into the feed; no special section handling needed.
- **`data` array is NOT exclusively Pins**: it can mix `type:"pin"` items with `type:"story"` recommendation modules (verified on `/KoffiKat/recipes/`: first item had `id:"WdzrLXos"`, `title` as an object `{format:"你可能喜欢的点子",args:[]}`, no image/link/videos). The command MUST filter to `type === "pin"` when accumulating.

Pin object fields (relevant):
- `id` (string), `grid_title` / `title` (string; may be empty for some video Pins), `description` (string, may contain trailing `\n` + hashtags), `link` (source URL), `domain` (source domain), `images` map with sizes `170x/136x136/236x/474x/736x/orig` (`orig.url` = full-resolution original), `grid_attribution { id, username, full_name }` (creator; fallback `pinner`), `board { id, name, url, owner, privacy }`, `is_video` (UNRELIABLE — observed `false` on video Pins), `videos { video_list: { V_HLSV4: { url: <m3u8>, thumbnail }, V_720P: { url: <mp4> }, ... } }` (reliable video discriminator: `videos.video_list` non-empty).
- Pin URL: `https://www.pinterest.com/pin/<id>/`.

Video Pin media shape (verified in board feed):
- `videoHlsUrl` = `videos.video_list.V_HLSV4.url` → e.g. `https://v1.pinimg.com/videos/iht/hls/8c/f9/5c/8cf95c1511eb9717dc01c5151b6df8df.m3u8`
- Direct mp4: `videos.video_list.V_720P.url` → e.g. `https://v1.pinimg.com/videos/iht/720p/8c/f9/5c/8cf95c1511eb9717dc01c5151b6df8df.mp4`
- Cover image: `videos.video_list.V_HLSV4.thumbnail` (also `images.orig`).

Grid DOM (not used as data source due to virtualization, but useful for waits):
- Grid container `[data-test-id="base-board-pin-grid"]`; pin card `[data-test-id="pin"]`; pin link `a[href^="/pin/"]`.

## Failure Signals

- NOT_FOUND: redirect to `https://www.pinterest.com/?show_error=true`. Throw `NOT_FOUND`.
- Empty board: `[data-test-id="board-header"]` renders but BoardFeedResource returns no data and `pin-count` shows 0 → return empty `pins` (do not throw).
- DRIFT_DETECTED: `[data-test-id="board-header"]` missing on a URL that did not redirect, OR a non-empty board yields no BoardFeedResource response within ~15s.
- Polite pacing / throttling: Pinterest may stop returning feed pages (bookmark stalls) or show interstitial challenges. Mitigation: random scroll steps (1.0–2.5 viewport heights) with random 200–500 ms waits; never hammer the API. If a scroll iteration yields no new Pins for many consecutive iterations, stop and return what was collected (partial=true).
- `is_video` field is unreliable (`false` even on video Pins) — always use `videos.video_list` presence to classify media.

## Capture Assessment

This command should be captured. It is the canonical way to read a Pinterest Board (user-curated collection / bookmark folder) and its Pins, and chains from `pinterest/get-user --tab saved` and `pinterest/search --type board` (both yield board URLs). The path is fully verified end-to-end in the explore workspace with real data samples, stable DOM selectors, a stable pagination API, and known failure signals. Runtime is browser (requires logged-in Pinterest session).
