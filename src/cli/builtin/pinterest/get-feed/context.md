# Context

## Precipitation Background (Why This Command Exists)

The Pinterest command family (only `pinterest/search` existed) had no way to read the homepage's personalized recommendation feed — the primary browse surface of Pinterest. `pinterest/get-feed` fills that gap, complementing `search` (keyword lookup) with the discovery stream.

## Value Assessment

The home feed is the most common Pinterest entry point; a logged-in user's feed is personalized and continuously refreshed. Returning structured Pin records (title/description/image|video/source/creator) in one call saves the caller from navigating and reverse-engineering the resource API. It also feeds chained workflows: feed → `pinterest/get-pin` for details, or feed → `pinterest/download` for media. Runtime is `browser` because the feed is login-gated and served by session-bound resource APIs.

## Page Structure

- Home URL: `https://www.pinterest.com/`
- SSR embedded state: `<script id="__PWS_INITIAL_PROPS__" type="application/json">` → `JSON.parse(text).initialReduxState`
  - `session.isAuthenticated` — login flag (`false` → `AUTH_REQUIRED`)
  - `pins` — map `"<pinId>" → full pin record` (first ~17 Pins; NOT updated on scroll)
- Feed pagination API: `GET /resource/UserHomefeedResource/get/?source_url=%2F&data={"options":{"field_set_key":"hf_grid",...,"bookmarks":["<base64>"]},"context":{}}`
  - Response: `resource_response.data` = object `"0".."N"` of pin records; `resource_response.bookmark` = next cursor (empty = exhausted); success when `resource_response.status === "success"` / `code === 0`
  - Each batch ~16-18 Pins; scrolling ~1 viewport (~800-1300px) triggers a new request
- Feed DOM (drift reference): `[data-test-id=masonry-container]` → `div[role=listitem]` → `[data-test-id=pin][data-test-pin-id]`. Card DOM is a reduced render (no creator/source/description) — full data comes from SSR + API.
- Pin field mapping: `id`, `title ← grid_title || title`, `description`, `imageUrl ← images.orig.url`, `videoHlsUrl ← videos.video_list` highest-duration variant `.url`, `sourceLink ← link`, `creator ← pinner{username, full_name}`, `pinUrl`.

## Environment Dependencies

- User Chrome/Edge must be running with remote debugging enabled (`chrome://inspect/#remote-debugging`, "Allow remote debugging" checked).
- **Pinterest must be logged in** — the home feed is personalized and login-gated. Not logged in → `AUTH_REQUIRED`.
- Polite pacing: randomized scroll step sizes, randomized short inter-scroll waits (200-500ms), occasional gentle mouse move; waits lengthen adaptively (`slowStreak`) when no progress / throttle signals appear. Do not harden these waits without re-testing the ≤10s (default limit 20) budget.
- The browser-runtime daemon and the explore-stage `@playwright/cli` are separate CDP attaches; a first-run Chrome "Allow remote debugging" prompt may delay connection.

## Failure Signals

- `session.isAuthenticated === false`, or landing page (login button, no masonry) → `AUTH_REQUIRED`.
- Neither `#__PWS_INITIAL_PROPS__` nor `[data-test-id=masonry-container]` present after load → `DRIFT_DETECTED`.
- API response with `status !== "success"` / `code !== 0`, or several consecutive scrolls with zero new unique Pin ids → throttled or feed ended → command backs off and returns `partial: true` (or `DRIFT_DETECTED` on persistent anomaly).
- DOM card count fluctuates while scrolling (masonry virtualizes off-screen nodes) — always count unique Pin ids, never DOM elements.

## Repair Clues

- If `__PWS_INITIAL_PROPS__` shape changes, fall back to DOM cards (`[data-test-id=pin][data-test-pin-id]` for id/pinUrl + `img` for title/image) and/or to the `UserHomefeedResource` API (still the authoritative full-field source).
- If the API path changes, re-derive from the page's network requests: any `/resource/<Name>Resource/get/` with `field_set_key=hf_grid` or a `bookmarks` cursor is the feed endpoint.
- If the homepage redirects to a different entry URL, update `FEED_URL`.
- Explore raw response samples (`homefeed-resp*.json`) are available for schema comparison.
