# Context

## Precipitation Background (Why This Command Exists)

Instagram has no public API. The Explore grid (`/explore/`) is a major discovery surface (algorithmic, cross-platform recommendations). WebSculpt's instagram command family (search, get-profile, get-post, get-feed) needed a counterpart for the Explore grid. Path verified in explore (confirmed 2026-08-16): the scroll loading is backed by the first-party REST endpoint `explore_grid`, not GraphQL. This command precipitates that verified path.

## Value Assessment

- Discoverability: the Explore grid surfaces new accounts and trending content across all of Instagram, not just followed accounts — the primary "what's hot right now" surface.
- Complements `instagram/search` (keyword) with algorithmic discovery; every returned tile URL feeds `instagram/get-post` for full captions/comments.
- Stable first-party REST path with simple cursor pagination (`max_id`), parameterizable by `limit`.

## Page Structure

- Page: `https://www.instagram.com/explore/` — media grid, initial render ~20 cards via GraphQL bootstrap; further scroll loads use the REST API.
- REST API (primary data source): GET `https://www.instagram.com/api/v1/discover/web/explore_grid/`
  - Fixed params: `include_fixed_destinations=true&is_nonpersonalized_explore=false&is_prefetch=false&module=explore_popular&omit_cover_media=false`
  - Pagination: `max_id=<response.max_id>` on the next request; `more_available` flag.
  - Headers needed: `x-ig-app-id: 936619743392459`, `x-requested-with: XMLHttpRequest`. Fetched in-page (`credentials: "include"`).
  - Response: `status:"ok"`, `sectional_items[]`, `more_available`, `max_id`.
  - Media nesting differs between pages: page 1 `sectional_items[].layout_content.fill_items[].media` (one_by_two layouts, ~15-16 items); pages 2+ `sectional_items[].layout_content.medias[]` (dynamic_grid, ~12 items). Robust extractor recursively walks `sectional_items` collecting every object with a `.code`.
  - Media fields: `code` (shortcode), `media_type` (1 image / 2 video / 8 carousel), `caption.text`, `like_count`, `comment_count`, `image_versions2.candidates[0].url` (thumbnail), `video_versions[]`, `carousel_media[]`.
- DOM fallback: `a[href*="/p/"], a[href*="/reel/"]` links → shortcode via `/\/(?:p|reel)\/([^/?#]+)/`, thumbnail from nested `img.src`.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled and a logged-in Instagram session (`authRequired: required`). The daemon connects over CDP and reuses the logged-in context.
- Rate limiting: Instagram enforces strict rate limits. Pagination requests are spaced randomly 1.5-2.5s. Do not hammer the endpoint.
- The grid DOM is virtualized (off-screen cards unmount), so DOM extraction is viewport-limited — API is the primary path, DOM only a fallback.

## Failure Signals

- `status !== "ok"` or `sectional_items` missing in the API response → structure drift (`DRIFT_DETECTED`).
- HTTP 403 from the API → not logged in / blocked (`AUTH_REQUIRED`).
- HTTP non-ok (other) → `API_ERROR`-ish; command falls back to DOM.
- `more_available` false with no new media → stream exhausted → `partial: true`.
- Repeated 429 / CAPTCHA → Instagram rate limiting; back off.

## Repair Clues

- If `explore_grid` changes, first check `sectional_items` nesting (the two shapes above) — the recursive walker is designed to survive layout-type changes.
- If the REST endpoint is blocked entirely, the DOM fallback still yields shortcodes/URLs from rendered links (navigate + extract), though `type`/counts are unavailable.
- The same cursor pattern (`max_id` + `more_available`) also applies to other Instagram web REST feeds (e.g. home feed); reuse the loop structure.
- Explore content is personalized and changes per run; validate structure (fields/counts), not specific content, when testing.
