# Context

## Precipitation Background (Why This Command Exists)

Precipitated from the Pinterest command-family expansion. The library previously had only `pinterest/search`. `pinterest/get-user` fills the profile lookup gap: after discovering a user via `pinterest/search --type user` or via the creator field of `get-pin`/`get-feed`, callers need the profile metadata and one content tab (saved boards or created pins). It also chains forward to `pinterest/get-board` from the returned board URLs.

Explore verification: assess passed, candidate `pinterest/get-user`, user-confirmed 2026-08-19. Verified against the real profile `https://www.pinterest.com/joyfilledeats/`.

## Value Assessment

- Generality: any Pinterest username works; the resource endpoints, selectors, and pagination are consistent across profiles.
- Reuse: profile + boards + created-pins is a frequent lookup pattern; chaining to `get-board`/`get-pin`/`download` makes it a core node in the command graph.
- Time saved: avoids manual browsing, SSR parsing, and re-discovery of the bookmark pagination scheme.

## Page Structure

- Profile URL: `https://www.pinterest.com/<username>/` (saved tab, default) and `https://www.pinterest.com/<username>/_created/` (created tab). Independent URLs; the created tab link is `#_created-profile-tab`.
- Profile data: `UserResource/get` with `{options:{username, field_set_key:"profile"}}` → `resource_response.data`.
  - Key fields: `full_name`, `about`, `follower_count`, `following_count`, `profile_views` (monthly views), `website_url`, `image_xlarge_url`, `eligible_profile_tabs`.
- Boards (saved): `BoardsResource/get` with `{options:{username, field_set_key:"profile_grid_item", page_size:25, sort:"last_pinned_to", privacy_filter:"all", group_by:"visibility", include_archived:true, filter_all_pins:false, add_fields:"board.{meal_plan}"}}`. First page array begins with a `type=story` "所有 Pin" card (skip); remaining items are `type=board`. Pagination via `resource_response.bookmark`; append `"bookmarks":["<prev>"]` for the next page.
- Created pins: `UserActivityPinsResource/get` with `{options:{exclude_add_pin_rep:true, field_set_key:"profile_created_grid_item", is_own_profile_pins:false, user_id, username, data:{page_size:50}, noCache:true}}`. Pagination via bookmark; 50 pins per page.
- DOM fallback selectors (data-test-id): `profile-name`, `profile-username`, `profile-followers-count`, `profile-following-count`, `main-user-description-text`, `gestalt-avatar-svg img`, `profile-header a[href^=http]`, `profile-board-card`, `board-card-title`, `[data-test-id=pin]` with `data-test-pin-id`.

## Environment Dependencies

- Requires the user's Chrome/Edge running with remote debugging enabled; WebSculpt daemon connects over CDP and reuses the logged-in Pinterest session.
- Login is required: all `/resource/*` data endpoints need a session. Verify `isAuthenticated` indirectly — a profile page that renders normally implies login; an absent profile-name or a redirect to `/?show_error=true` indicates NOT_FOUND (or a login wall for protected profiles).
- IMPORTANT: raw in-page `fetch` to `/resource/*` returns `Invalid Resource Request` (internal auth). The command MUST capture the page's own XHR via `page.waitForResponse` armed BEFORE `page.goto`.
- Polite pacing: random scroll offsets + random short waits (200-500ms) between scrolls; adaptive backoff (longer wait + retry) when a pagination response is missing (possible throttling). Keep low frequency.

## Failure Signals

- NOT_FOUND: final URL contains `show_error=true`, or `[data-test-id=profile-name]` is absent after load.
- Structure drift: `[data-test-id=profile-name]` missing on an existing profile, or the resource responses (UserResource / BoardsResource / UserActivityPinsResource) stop firing. Throw `DRIFT_DETECTED` with the selector/endpoint name.
- Throttling/rate limiting: a paginated response does not arrive after a scroll (waitForResponse timeout). The command backs off and retries once, then returns `partial: true` with whatever was collected.
- `following_count` may differ slightly from the SSR first-paint text (180 vs 173); the API value is authoritative.

## Repair Clues

- If `field_set_key:"profile"` on UserResource stops matching, drop the `extra` filter and match `UserResource` + `"username"` only; profile fields may also be read from the SSR DOM.
- If BoardsResource URL matching is too strict, relax to `BoardsResource` + `"username"` and filter out `page_size":1` header calls (they have no `field_set_key`).
- The profile page can also be read purely from SSR DOM for the metadata (name/username/bio/avatar), though follower/following/monthly-views counts then come as localized text.
- Board URL can be reconstructed from the board `url` path field; owner info from the nested `owner` object (`username`, `full_name`).
