# Context

## Precipitation Background (Why This Command Exists)

Facebook search was a pending browser-only platform. A Chrome session with an active Facebook login exposed stable SSR and GraphQL search page-data for top, pages, groups, and people tabs, making the path reusable.

## Value Assessment

The command parameterizes query, type, and limit while retaining native Facebook fields, avoiding repeated browser exploration for routine searches.

## Page Structure

Navigate to `/search/{type}` with `q=` for `top`, `pages`, `groups`, `people`, `videos`, or `events`. Parse scripts containing `serpResponse.results.edges`; for fallback, re-navigate and read `[role="feed"] [role="article"]`. Page scrolling is serial and bounded.

Video results use `SearchNativeVideoViewModel` (no `profile`/`story`), so they need a dedicated extractor; `relative_time_string` is localized text (no unix `creation_time`), so no ISO timestamp is fabricated. Event results reuse `SearchProfileViewModel` with `profile.__typename === "Event"`. `open_video_uri` carries a per-session `external_log_id` nonce that should be stripped for stable URLs.

## Environment Dependencies

Requires the user's Chrome session with an active Facebook login. Uses the browser runtime, short randomized waits, light serial scrolling, no detail fan-out, and no CAPTCHA/403/429 bypass. Facebook request bodies are intentionally not replayed.

## Failure Signals

No session or challenge is `AUTH_REQUIRED`; missing native edges plus missing DOM results is `DRIFT_DETECTED`; valid empty page-data returns an empty result without fallback.

## Repair Clues

The primary path is inline SSR/GraphQL page-data. The fallback re-navigates the target search URL and extracts visible article text/links/images. If both paths fail, stop and report drift.
