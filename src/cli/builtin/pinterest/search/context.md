# Context

## Precipitation Background (Why This Command Exists)

The existing `pinterest/search` command only searched Pins (limit 1-20, type pinned to "pins", with `sort`/`time` placeholder parameters that were ignored). Pinterest itself offers three search surfaces — Pins, Boards, and Users — each with its own URL, and the results page shows related-query chips. This rework upgrades the command to expose all three types, raises the limit to 100 using the verified `BaseSearchResource` bookmark pagination, removes the meaningless `sort`/`time` placeholders, and adds `related_queries` for chain-search use cases. The contract was confirmed by the user on 2026-08-19.

## Value Assessment

Search is the entry point of the whole Pinterest command family: `search` discovers Pins (→ `get-pin`), Boards (→ `get-board`), and Users (→ `get-user`). Returning all three content types plus related-query suggestions makes the command generally reusable for discovery, topic research, and creator/collection lookup, while the single `query`/`type`/`limit` interface keeps it predictable.

## Page Structure

- Pins: `https://www.pinterest.com/search/pins/?q=<query>`. Cards `[data-test-id=pin]` (`data-test-pin-id`). Related queries: `[data-test-id=one-bar-module-3] [data-test-id=one-bar-pill]`. Filter dropdown `[data-test-id=search-filter]` → only `search-filter-all-pins` / `search-filter-your-pins` (no sort/time).
- Boards: `https://www.pinterest.com/search/boards/?q=<query>`. Cards `[data-test-id=board-card]` with `a[href="/<user>/<board>/"]`; card text: `<name>\n<owner>\n<N> 张 Pin 图\n·\n<updated>`.
- Users: `https://www.pinterest.com/search/users/?q=<query>`. Cards `[data-test-id=user-rep-with-card]` → `[data-test-id=user-rep]` → `a[href="/<username>/"]`; card text: `<displayName>\n<N> 位粉丝\n关注`.
- Pagination: `POST /resource/BaseSearchResource/get/` (pins/boards) with `bookmark` cursor, 25 results/page for pins, ~50 for boards. The Pin card DOM is virtualized — node count fluctuates; progress must be tracked by accumulated unique `data-test-pin-id`.
- Data: pin API results carry `title`, `grid_title`, `description`, `pinner` (username/full_name), `images.orig` full-res URL, `board.name`, `domain`, `link` (external source), `reaction_counts`.

## Environment Dependencies

- Requires a logged-in browser session (`requiresBrowser: true`); Pinterest's data endpoints are gated behind login.
- Browser runtime attaches the user's existing Chrome via CDP; no new browser is launched.
- Polite pacing: randomized short scroll waits (200-500ms) with randomized scroll steps; on no-growth/throttle suspicion the wait lengthens (500-1300ms extra). 12+ scroll steps during exploration triggered no CAPTCHA/403.
- Execution-time target ≤10s at the default limit (20 pins = a single API page, no scroll); large `limit` values naturally take longer as more pages load.

## Failure Signals

- Blank query → `MISSING_PARAM`; non-positive/non-integer limit → `INVALID_PARAM`; limit > 100 → `LIMIT_EXCEEDED`; unknown type → `INVALID_TYPE`.
- If the result selector is absent and the page does not show an explicit no-results message → `DRIFT_DETECTED`.
- Empty results page (no results / 未找到 / 没有结果 / nothing found) → returns `{ items: [], count: 0, partial: true }`.
- API response interception may fail (network/body issues) → swallowed, with a DOM-card fallback that returns minimal items (rich fields null).
- CAPTCHA/login wall/403/429: surfaced rather than bypassed.

## Repair Clues

- If Pinterest changes markup, re-verify `[data-test-id=pin]` / `data-test-pin-id` on the pin search page, `[data-test-id=board-card]` on boards, `[data-test-id=user-rep-with-card]` on users, and `[data-test-id=one-bar-module-3] [data-test-id=one-bar-pill]` for related queries.
- If the `BaseSearchResource` response shape changes, the DOM fallbacks for pins and boards still return core fields (id/title/imageUrl/url); keep those null-field semantics.
- Related queries only appear on the pin search surface; board/user pages intentionally return an empty array.
