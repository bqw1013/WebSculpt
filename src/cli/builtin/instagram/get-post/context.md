# Context

## Precipitation Background (Why This Command Exists)

Instagram list commands (`instagram/search`, and the planned feed/explore/profile commands) return media cards. To read a single post's full caption and comment thread you need to open its URL. `instagram/get-post` fills that gap: it accepts any post or reel URL and returns the full post plus optional comments (top-level paginated + nested replies auto-expanded). Reels are structurally posts on the web when served via `/p/{shortcode}/`.

## Value Assessment

- Reuse frequency: high — every list command (`get-feed`, `get-explore`, `get-profile`, `search`) points to `get-post` for full text/comments.
- Generality: covers posts, carousels, videos and reels; three URL forms.
- Saves: manual browser opening, caption/comment extraction, and nested-reply expansion.

## Page Structure

- Post URL normalized to `https://www.instagram.com/p/{shortcode}/` (never `/reel/` — that 301-redirects to `/reels/` browse feed with a different embedded structure `xdt_api__v1__clips__home__connection_v2`).
- Post data is embedded server-side as a RelayPrefetchedStreamCache JSON payload inside `<script type="application/json">`. Locate recursively by the key `xdt_api__v1__media__shortcode__web_info`; the post is `items[0]`.
- Key fields: `code` (shortcode), `pk` (media id), `taken_at` (unix s), `user{username}`, `caption{text}`, `like_count`, `comment_count`, `hidden_likes_string_variant` (-1 = likes hidden, common on reels), `product_type` (clips/carousel_container/image_container/video_container), `image_versions2.candidates[]`, `video_versions[]`, `carousel_media[]`.
- Comments: two first-party GraphQL queries against `POST /api/graphql`:
  - Top-level: `PolarisPostCommentsPaginationQuery`, doc_id `28082902984733691`, variables `{after, first, media_id, sort_order}`. Response `data.xdt_api__v1__media__media_id__comments__connection` with `edges[].node` (XDTCommentDict) and `page_info.end_cursor` (serialized `{cached_comments_cursor, bifilter_token}` JSON) for pagination.
  - Replies: `PolarisPostChildCommentsQuery`, doc_id `27823744063932558`, variables `{media_id, parent_comment_id, after, first}`. Response `data.xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection`.
- Comment node fields: `pk` (id), `user{username}`, `text`, `created_at` (unix s), `comment_like_count`, `child_comment_count`.

## Environment Dependencies

- Requires a logged-in Instagram session in the attached Chrome/Edge; all data paths are behind login.
- GraphQL request body template: capture a real `/api/graphql` POST body via `page.waitForResponse`, then re-issue in page context with `fb_api_req_friendly_name`, `doc_id` and `variables` replaced (same pattern as `instagram/search`). Synthesizing a body without `fb_dtsg`/`lsd` fails with error 1357004.
- GraphQL responses are wrapped in a `for (;;);` XSSI prefix — strip it before `JSON.parse` in page context.
- Polite pacing: Instagram is strict. Keep 1.5–3s random waits between GraphQL requests; avoid rapid-fire pagination on hot posts.

## Failure Signals

- `xdt_api__v1__media__shortcode__web_info` absent while the page renders a valid post → structure drift → `DRIFT_DETECTED`.
- Page text shows login prompts → `AUTH_REQUIRED`.
- Page text shows "this page isn't available" / equivalent → `NOT_FOUND`.
- Comment GraphQL returns error 1357004 → invalid/expired tokens → re-capture a fresh request body template.
- Clicking the comment-count button on a reel `/p/` page does NOT reliably trigger pagination (Relay cache / button semantics) — always call the API directly, never depend on DOM clicks for comment data.

## Repair Clues

- If the embedded `web_info` key moves, fall back to scanning all `<script>` text for the shortcode and locating the item whose `code` equals the shortcode.
- If `PolarisPostCommentsPaginationQuery`/`PolarisPostChildCommentsQuery` doc_ids change, hook a real page interaction (click a "view all N replies" button) and capture the new `fb_api_req_friendly_name` + `doc_id` from the request body.
- Media URLs: `image_versions2.candidates` (highest `width` wins) and `video_versions` (highest `width` wins) are stable; if absent, read `display_uri`/`preview`.
- The "popular" comment sort (`sort_order: "popular"`) paginates only through a subset of the total comment count (verified: a post with commentCount 104 exposed 83 retrievable comments via 52 top-level + 31 replies, then `has_next_page` became false). `partial` is therefore false when the popular feed is fully read even if fewer than `comment_limit` were returned. This is Instagram-side behavior, not a bug.
- Hidden-like detection: `hidden_likes_string_variant` is `-1` for BOTH normal posts and reels, so it cannot be used to detect hidden likes. Use the placeholder pattern instead: reel (`product_type === "clips"`) with `like_count <= 5` and `comment_count > 50` indicates hidden likes.
