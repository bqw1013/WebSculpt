# Context

## Precipitation Background (Why This Command Exists)

WebSculpt already has `facebook/search` for discovering Facebook objects (including groups). There was no command to read a specific group's info and its post feed. Facebook groups are the most concentrated place for topic discussions; public group content is readable without joining, making `facebook/get-group` a high-value complement to the planned command family (`get-feed`, `get-post`, `get-profile`, `get-page`).

## Value Assessment

- Reuse value: high. Reading a group's header (name/members/privacy/about) and its post stream is a common task; the command composes with `facebook/search` (discovery) and `facebook/get-post` (per-post full text/comments).
- The extraction logic (role/attribute/URL anchors, text cascade, incremental scroll collection) is reusable across the Facebook command family.
- Saves manual browser navigation and repeated re-derivation of Facebook's unstable DOM structure.

## Page Structure

- Group page: `https://www.facebook.com/groups/{group}/` (`group` = numeric ID or vanity name).
- Group header combined element text: `{name} {公开小组|私密小组} · {member count} 位成员 加入小组 分享`.
- Group name: first `h1` inside `[role=main]` that is not `通知`.
- Posts: `div[role=article]`, filtered by a `/groups/{gid}/posts/{postId}/` link without `comment_id`.
- Author: `/groups/{gid}/user/{uid}/` link with visible text (the name).
- Time: short-text link to the post permalink.
- Text cascade: `[data-ad-preview="message"]` → first meaningful `[dir="auto"]` (clone article, remove nested comments) → longest leaf text `div`. Hashtag text duplicates; apply half-dedupe.
- Media: `img[src*="scontent"]`/`img[src*="fbcdn"]` (exclude `static.xx.fbcdn.net/images/emoji.php/`), plus `video`.
- Feed loading: scroll-lazy-loaded and DOM-virtualized; extract incrementally while scrolling, dedupe by postId.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled and an active Facebook login (`authRequired: "required"`).
- Browser runtime: the command CDP-attaches to the user's Chrome; the first connect may trigger a system confirmation dialog. If the command returns `BROWSER_ATTACH_REQUIRED`, check remote debugging and the dialog.
- Polite pacing: randomized scroll deltas, occasional mouse moves, 1-2s natural pauses. Do not hammer; Facebook has strict rate limits.
- Parallel `facebook/get-feed` and `facebook/get-post` share the same Chrome session; tests should run serially with random delays between batches.

## Failure Signals

- Non-existent group: page title/body contains `找不到` / `Page not found` / `此页面不可用`; or no group-name `h1` and no combined header meta → `NOT_FOUND`.
- Private group not joined: header shows `私密小组` and no `[role=feed]`/`[role=article]` posts → returns `privacy: "private"`, empty `posts`, `partial: true`.
- Structural drift: reachable group page without header anchors → `DRIFT_DETECTED`.
- Rate limiting / checkpoint / freeze: feed stops loading new posts on scroll while not exhausted → stop, return collected posts with `partial: true`.
- Feed exhaustion: consecutive scrolls add no new posts (noProgress threshold) → stop, `partial: true`.

## Repair Clues

- If `data-ad-preview="message"` stops appearing and `dir=auto` is also gone, the text fallback (longest leaf div) and its exclusion rules are the primary repair point.
- If member count format changes (e.g. `K`/`M` suffixes in an English locale), extend the regex `/([0-9][0-9.,]*)\s*(万|K)?\s*位?成员/` and the multiplier logic.
- If the UI locale changes (non-Chinese), the keywords `公开小组`/`私密小组`/`通知`/`成员` would change; the header text-match and h1-skip logic are the repair point.
- Permalink form: the feed exposes `/groups/{gid}/posts/{postId}/`; the command now preserves this raw anchor href (tracking params stripped) instead of rebuilding `/groups/{gid}/permalink/{postId}/`. The feed's `postId` is sometimes a NON-canonical story id: rebuilding a `/permalink/{postId}/` URL makes it resolve to a random feed/sidebar page (non-deterministic), while the original `/posts/{postId}/` href navigates to the post correctly (verified for both vanity and numeric group ids). The `postId` is still used internally for dedup only.
- Private-group gated view could not be directly re-verified in explore (search/discover surfaced only public groups in this session); verify behavior during maintenance if the site changes.
