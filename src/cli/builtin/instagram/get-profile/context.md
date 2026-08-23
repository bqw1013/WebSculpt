# Context

## Precipitation Background (Why This Command Exists)

Instagram has no public API channel; every data path requires a logged-in browser. The command library had `instagram/search` (discovers accounts/media) but no way to read a profile once an account is found. Explore independently verified the profile-header query and the four content tab queries on two accounts (`shopify`, `lego`), all four tabs, with real response samples saved as JSON. This command was captured to make that verified path reusable.

## Value Assessment

Core Instagram entity command: after finding an account (feed, search, comments), you want its profile + content. Highly reusable, complements `instagram/search`. Covers the profile page's four native tabs, mirrors their URLs, and returns the same data the page shows. Verified stable against first-party GraphQL with documented doc_ids.

## Page Structure

Profile pages on modern Instagram render from first-party GraphQL POSTs (`https://www.instagram.com/graphql/query`, `application/x-www-form-urlencoded`, body fields `fb_api_req_friendly_name`, `variables` (JSON), `doc_id`). There is NO usable embedded data (`window._sharedData` is empty; `og:description` is stale). Every tab page load fires the profile header query `PolarisProfilePageContentQuery` (doc_id `38611279431804694`) → `data.user`.

Tab query map (friendly name, initial → pagination, doc_ids, cursor):

| tab | URL path | initial friendly (doc_id) | pagination friendly (doc_id) | cursor |
|---|---|---|---|---|
| posts | `/` | `PolarisProfilePostsQuery` (`37691262543822084`) | `PolarisProfilePostsTabContentQuery_connection` (`27698568663128134`) | `after` + `first:12` ← `page_info.end_cursor` |
| reels | `/reels/` | `PolarisProfileReelsTabContentQuery` (`38132256686365646`) | `PolarisProfileReelsTabContentQuery_connection` (`27724789533808112`) | `after` + `first:5` ← `page_info.end_cursor` |
| reposts | `/reposts/` | `PolarisProfileRepostsTabContentQuery` (`27906964345564087`) | `PolarisProfileRepostsTabContentRefetchQuery` (`27999620666337672`) | `max_id` ← `user_reposts_timeline.repost_next_max_id` |
| tagged | `/tagged/` | `PolarisProfileTaggedTabContentQuery` (`27774806538807664`) | `PolarisProfileTaggedTabContentQuery_connection` (`27391179227227772`) | `after` + `first:12` ← `page_info.end_cursor` |

Response roots: posts → `data.xdt_api__v1__feed__user_timeline_graphql_connection`; reels → `data.xdt_api__v1__clips__user__connection_v2` (edges `node.media`); reposts → `data.fetch__XDTUserDict.user_reposts_timeline` (`repost_grid_items[{media}]`); tagged → `data.xdt_api__v1__usertags__user_id__feed_connection`. Media nodes are `XDTMediaDict` with `code`, `media_type` (1/2/8), `caption.text`, `taken_at`, `like_count`, `comment_count`, `image_versions2.candidates[]`.

## Environment Dependencies

- Logged-in Instagram session in user Chrome/Edge with remote debugging enabled (browser runtime).
- Reuses the initial tab query's captured request body (`response.request().postData()`) for pagination; only `fb_api_req_friendly_name`, `doc_id`, and `variables` are rewritten. The session tokens (`fb_dtsg`, `lsd`, `__dyn`, ...) in that body must be FRESH — a reused body older than a few minutes gets 403 HTML. Do not hand-construct bodies without those tokens.
- Rate limiting: random 1.5–3s waits between pagination requests; do not hammer. Observed a 403 HTML on a stale manual fetch — treat any non-JSON pagination response as a stop signal (the loop already breaks on it).

## Failure Signals

- `NOT_FOUND`: profile query (`PolarisProfilePageContentQuery`) never responds — nonexistent username or login wall. The page usually redirects to a "not available" page.
- Private account: profile returns `is_private: true` and the tab query may not fire → command returns `{ profile, posts: [], partial: true, reason: "private" }`.
- `DRIFT_DETECTED`: initial tab query response schema missing the expected root field — Instagram changed the query shape.
- Pagination response not JSON / 403 / schema null → loop breaks, returns partial. If this happens repeatedly on fresh runs, the friendly names or doc_ids changed (repair needed).
- Reposts tab can be genuinely empty (`repost_more_available:false`, `repost_grid_items:[]`) for accounts that never repost → empty posts + partial.

## Repair Clues

- Friendly names / doc_ids change when Instagram updates its GraphQL layer. To re-discover: open the tab URL in a logged-in browser, inspect network for `POST /graphql/query` and `/api/graphql`, read `fb_api_req_friendly_name` and `doc_id` from the bodies.
- Profile header and tab queries can also be matched by header `x-fb-friendly-name`; if headers drop the name, match on the body field `fb_api_req_friendly_name`.
- If manual-fetch pagination regresses (403/HTML), fall back to driving real UI scroll (`window.scrollTo(0, document.body.scrollHeight)`) and capturing the natural `_connection`/`Refetch` responses via `page.waitForResponse`.
- `media_type` mapping (1 image / 2 video / 8 carousel) and `image_versions2.candidates[]` thumbnail source are long-stable; `view_count`/`like_count` can be null when counts are hidden.

## PITFALL: waitForResponse fire-and-forget can crash the daemon

Every `page.waitForResponse` promise carries a timeout rejection. If a promise is created but never awaited on every code path, its rejection becomes an **unhandled rejection** that bubbles to the shared websculpt daemon's `unhandledRejection` handler and **kills the daemon**, disconnecting all concurrent browser sessions.

In this command, two `waitForResponse` promises are created before `goto`: `profileRespPromise` and `tabRespPromise`. On the NOT_FOUND path, `profileRespPromise` rejects → the function throws via `fail()` and exits **before ever awaiting `tabRespPromise`** → `tabRespPromise`'s 15s timeout rejection was fire-and-forget.

Rule: for any `waitForResponse` promise that may not be awaited on every path, attach `.catch(() => null)` **at creation** (e.g. `waitForQuery(...).catch(() => null)`), then handle the resolved `null` explicitly. Only the promise that is guaranteed awaited (here `profileRespPromise`, inside try/catch) can skip the guard. Do not reintroduce a bare `const p = waitForResponse(...)` that a NOT_FOUND/early-return path can abandon. (2026-08-17 fix)

## Repair Record 2026-08-23 (reels tab drifted to `fetch__XDTUserDict.clips_connection`)

- **Symptom**: `websculpt instagram get-profile --user shopify --tab reels --limit 5` returns `DRIFT_DETECTED: unexpected schema from PolarisProfileReelsTabContentQuery`. Only reels broke; posts / reposts / tagged tabs still worked.
- **Root cause**: Instagram moved the reels tab response one level deeper. Old root `data.xdt_api__v1__clips__user__connection_v2` → new root `data.fetch__XDTUserDict.clips_connection` (`{ edges[], page_info: {end_cursor, has_next_page} }`). Edge shape is unchanged (`node.media`). Two further changes in the same drift:
  - Reels pagination doc_id changed `27724789533808112` → `28143376935350124`.
  - Reels pagination variables now require a top-level `id` (user id) alongside `after` / `data` (with `target_user_id`) / `first: 5`.
- **Fix**: reels `parse` reads `data.fetch__XDTUserDict.clips_connection` (falling back to the old root defensively); `pagDocId` updated; `makePagVars` adds `id: ctx.userId`.
- **Data note**: the new reels media node is a reduced shape — `code`, `media_type`, `product_type`, `play_count`, `like_count`, `comment_count`, `image_versions2.candidates[]`, `user`. It no longer carries `caption` or `taken_at`, so reels items return `caption: null` / `timestamp: null`. Posts / tagged media still carry both.
- **Experience**: initial reels query doc_id also changed (`28244684488496159`) but the command reuses the page's captured body, so only the pagination doc_id matters in code. Profile query (`PolarisProfilePageContentQuery`) and the other tabs were untouched. When reels drifts again, re-probe `https://www.instagram.com/{user}/reels/` network and inspect `POST /graphql/query` bodies/responses for `PolarisProfileReelsTabContentQuery*`.
