# Context

## Precipitation Background (Why This Command Exists)

Medium's command library previously had `medium/get-tag-trending`, which used `/tag/<slug>` and capped `limit` at 20. The command-family plan requires the command family to align with Medium's UI terminology ("topic") and switch to the lazy-loading `/tag/<slug>/recommended` stream so that up to 100 articles can be returned.

## Value Assessment

This command is the primary entry point for discovering trending content by topic on Medium. It is reusable for content research, trend monitoring, and as a feeder for downstream commands such as `medium/get-article` (via article URLs) or `medium/get-author` (via author usernames).

## Page Structure

- **URL pattern**: `https://medium.com/tag/<slug>/recommended`
- **Primary data source**: live Apollo Client cache (`window.__APOLLO_CLIENT__.cache.data.data`)
- **Tag resolution**: `ROOT_QUERY["tagFromSlug({\"tagSlug\":\"<slug>\"})"]`
- **Feed path**: `Tag:<slug>` → `viewerEdge` → `TagViewerEdge` → `recommendedPostsFeed:(limit:10)`
- **Feed shape**: `TagFeedResult` with `items` (array of `TagFeedItem`) and `pagingInfo.next`.
- **Post shape**: `Post:<id>` contains `title`, `mediumUrl`, `clapCount`, `readingTime`, `firstPublishedAt`, `latestPublishedAt`, `creator`, `tags`, `previewImage`, `extendedPreviewContent.subtitle`, `postResponses.count`, `isLocked`.

**Important**: `window.__APOLLO_STATE__` is only the server hydration snapshot and does not update when scrolling. Extraction must use the live Apollo Client cache, which grows as the lazy stream loads more items.

## Environment Dependencies

- Requires Chrome or Edge with remote debugging enabled.
- No login required; public content only.
- The recommended stream is personalized for logged-in sessions, so results may vary by browser session.
- Includes small random waits, mouse movements, and smooth scrolling to maintain a polite pacing profile.

## Failure Signals

- `TAG_NOT_FOUND`: `tagFromSlug(...)` returns `null`.
- `PAGE_LOAD_FAILED`: Apollo cache not available after timeout.
- `DRIFT_DETECTED`: `TagViewerEdge` or `recommendedPostsFeed` key missing from cache.
- `EMPTY_RESULT`: Feed has no resolvable posts.
- `INVALID_PARAM`: `limit` outside 1–100 or not an integer.

## Repair Clues

- If the feed key changes (e.g. from `recommendedPostsFeed:(limit:10)`), update the key-matching logic (`startsWith("recommendedPostsFeed")`).
- If Medium stops exposing `window.__APOLLO_CLIENT__`, fall back to DOM extraction (titles, URLs, author names, publication names, dates) but note that engagement metrics may be lost.
- If the stream stops lazy-loading, verify the scroll strategy and whether Medium added a "load more" button or changed the intersection observer threshold.
