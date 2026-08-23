# Context

## Precipitation Background (Why This Command Exists)

The assessed Product Hunt exploration showed that launch comments are a distinct, reusable surface from product Reviews and Product Forum threads. Linear Diffs exposed a launch-specific comments feed with a verified page-2 route, while Work with Linear confirmed the same path and field shape on a second launch.

## Value Assessment

Given a product slug and launch slug, callers can retrieve a launch discussion without rediscovering the page structure. The compact default is suitable for discovery and downstream summaries; detailed mode preserves the surrounding launch context when needed.

## Page Structure

Navigate to `/products/{product-slug}/launches/{launch-slug}`. For `page > 1`, append `?page={page}#comments`; the browser may normalize away the hash. Wait for `[data-test="modal"]` and `[data-test="comments-feed"]`. Exclude `comment-form`, `comment-form-editor`, `form-submit-button`, and `comment-menu-button` from comment extraction; collect `thread-*` and `comment-*` content from the feed.

## Environment Dependencies

Requires Chrome/Edge remote debugging; the explored public pages did not require login. Keep browser etiquette lightweight: one short randomized wait before extraction, at most one small mouse movement, and a randomized 0–2 second wait before returning. Do not close the caller's page.

## Failure Signals

Return `NOT_FOUND` for a 404/not-found page. If the expected launch modal or comments feed is absent after navigation, return `DRIFT_DETECTED`. A rendered feed with no comment nodes returns `EMPTY_RESULT`.

## Repair Clues

Do not fall back to `/p/{product-slug}`: exploration confirmed that it is the Product Forum listing and belongs to the forum-thread commands. Do not infer API endpoints or expose unverified limit/sort inputs; repair should begin by rechecking the launch modal/feed selectors and the rendered pagination links.
