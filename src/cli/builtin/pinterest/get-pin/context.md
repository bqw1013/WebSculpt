# Context

## Precipitation Background (Why This Command Exists)

Pinterest's core entity is the Pin (one image or video post). The command family (`search`, `get-feed`, `get-board`, `get-user`) all surface Pin links/ids, and callers need a way to read the full detail of a single Pin. This command is the designated entry point for that — the first Pin command to be captured (verified in a prior explore workspace).

## Value Assessment

- High reuse: a single Pin detail is required from every Pinterest discovery path (search, feed, board, user, trends).
- SSR-first extraction means the default path (no comments/related) is fast and stable.
- Comments and related Pins extend the value into the full engagement surface of a Pin.

## Page Structure

- URL: `https://www.pinterest.com/pin/<id>/` (also works for a bare numeric id; the command normalizes it).
- SSR data: `<script id="__PWS_INITIAL_PROPS__" type="application/json">` → `initialReduxState.pins[<id>]`.
  - `title` = `closeup_unified_title` (fallback `grid_title`). Do NOT use `seo_title` (localized nav text) or `title` (often empty).
  - `description` = `closeup_description`. The raw `description` field is a `" "` placeholder.
  - `imageUrl` = `images.orig.url` (pinimg.com original).
  - `videoHlsUrl` = `videos.video_list.V_HLSV4.url` (present only on video Pins). Detect video by this field, NOT `is_video` (unreliable — was `false` on a verified video Pin).
  - `sourceLink` = `link`; `domain` = host.
  - `creator` = `pinner` (`username`, `full_name`; no `profile_url` field — construct from username).
  - `reactionCount` = `reaction_counts["1"]` (the displayed save count).
  - `commentCount` = `aggregated_pin_data.comment_count` (the rendered `#comments-heading` can be a few higher).
- Comments (lazy): click `[data-test-id="canonical-card-tap-area"]` to expand. Feed loads via `UnifiedCommentsResource/get` (fields `details`/`done_at`) and `AggregatedCommentReplyFeedResource/get` (fields `text`/`created_at`). Rendered items are `[data-test-id="author-and-comment-container"]`; author is the inner `<a href="/<username>/">`, text is the non-empty `[data-test-id="text-container"]`. Scroll the comment feed container (scrollable ancestors + window) to paginate (bookmark cursor).
- Related Pins: `window.scrollTo(0, scrollHeight)` triggers `RelatedModulesResource/get` (`page_size:12`, bookmark pagination). Response `resource_response.data[]` are full pin objects; map `id`, `title || grid_title`, `images.orig.url`, and `https://www.pinterest.com/pin/<id>/`.
- NOT_FOUND: bad id 302-redirects to `https://www.pinterest.com/?show_error=true`, and the id is absent from `initialReduxState.pins`.

## Environment Dependencies

- Runtime `browser`: requires the user's Chrome with remote debugging enabled and a logged-in Pinterest account. First daemon CDP attach may trigger Chrome's "Allow remote debugging" consent prompt.
- Polite pacing: Pinterest throttles heavy browsing. The command paces scrolls/loads with random short waits (200–500ms) and adaptive backoff on no-progress. Keep request frequency low; avoid mass-fetching detail pages.

## Failure Signals

- `NOT_FOUND`: URL no longer matches `/pin/<id>/`, or the pin is missing from SSR.
- `DRIFT_DETECTED`: `#__PWS_INITIAL_PROPS__` missing / not JSON-parseable; `initialReduxState.pins` absent; comment tap selector gone; comment/related resource URLs changed.
- Throttling: slow response, CAPTCHA, or verification page → lengthen intervals (already handled via backoff).
- Comment count mismatch: `aggregated_pin_data.comment_count` may differ slightly from the rendered heading; the field is the stable data-layer value.

## Repair Clues

- If the SSR script tag id changes, search for a JSON script containing `initialReduxState` (e.g. `#__PWS_INITIAL_PROPS__` → new id) and re-anchor `extractPinFromSsr`.
- If comment resource names change, look for the network resource that returns arrays with `user` + `details`/`text`/`done_at`/`created_at` and update `COMMENT_RESOURCE_RE`.
- If related resource changes, look for a resource returning pin objects keyed by the pin id and update `RELATED_RESOURCE_RE`.
- Author/time fallback: comment text/author come from the DOM; createdAt is enriched from API responses. If API capture fails, comments still return with `createdAt: null`.
