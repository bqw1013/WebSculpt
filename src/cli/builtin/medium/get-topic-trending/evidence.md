# Evidence: medium/get-topic-trending

This document records the research and validation evidence for the `medium/get-topic-trending` command.

## Exploration Path

- Checked existing Medium commands with `websculpt command list medium`.
- Imported old command `medium/get-tag-trending` via `websculpt capture import medium get-tag-trending` as reference.
- Read the command-family plan, design guidelines, and WebSculpt maintain/explore/capture guidance.
- Created an explore workspace and used a Playwright CLI session to verify `/tag/<slug>/recommended` structure and lazy-loading behavior.

## Verified URLs

- `https://medium.com/tag/artificial-intelligence/recommended` — primary data source. Initial 10 articles, lazy-loads to 80+ articles on scroll.
- `https://medium.com/tag/this-topic-does-not-exist-xyz123/recommended` — verified missing-topic signal (`tagFromSlug` returns `null`).

## Structural Evidence

### Live Apollo cache is the correct data source

On `/tag/<slug>/recommended`, the server hydration snapshot `window.__APOLLO_STATE__` only contains the first 10 items and does not grow when scrolling. The live Apollo Client cache at `window.__APOLLO_CLIENT__.cache.data.data` is updated as the lazy stream loads more items. Extraction must read from the live cache.

### Tag resolution

Path in cache: `ROOT_QUERY["tagFromSlug({\"tagSlug\":\"<slug>\"})"]`.

- Exists and has `__ref` → topic exists.
- Returns `null` → topic does not exist (`TAG_NOT_FOUND`).

Resolved `Tag:<slug>` object on `/recommended` provides:
- `id` — slug
- `displayTitle` — human-readable topic name
- `normalizedTagSlug`
- `viewerEdge` — reference to `TagViewerEdge`

### Recommended feed

Path: `Tag:<slug>.viewerEdge` → `TagViewerEdge` → `recommendedPostsFeed:(limit:10)`.

Feed object (`TagFeedResult`):
- `items` — array of `TagFeedItem` objects; grows as the page scrolls.
- `pagingInfo.next` — `{ from, limit, source, to }`; indicates more items are available.

Feed item shape:
```json
{
  "__typename": "TagFeedItem",
  "feedId": "...",
  "reason": 107,
  "moduleSourceEncoding": null,
  "post": { "__ref": "Post:<postId>" }
}
```

Feed key stays `recommendedPostsFeed:(limit:10)`; the `items` array and `pagingInfo` are updated in place.

### Post object fields

Resolved `Post:<postId>` provides:
- `id` (string, 12-char hex)
- `title` (string)
- `mediumUrl` (string, full article URL)
- `clapCount` (number)
- `readingTime` (float, minutes)
- `firstPublishedAt` (timestamp in ms)
- `latestPublishedAt` (timestamp in ms)
- `creator` (`User` __ref)
- `tags` (array of `Tag` __refs)
- `previewImage` (`ImageMetadata` with `id`)
- `extendedPreviewContent.subtitle` (string)
- `postResponses.count` (number)
- `isLocked` (boolean)
- `isPublished` (boolean)
- `visibility` (string)

### Author / publication resolution

- `creator` resolves to `User:<id>` with `name`, `username`. Profile URL: `https://medium.com/@<username>`.
- Some posts are in publications. `Post.mediumUrl` already contains the publication domain/path. The old command did not expose publication; the new command adds a `publication` object parsed from the article URL when the hostname is not `medium.com` and the path does not start with `/@`.

### Image construction

From `previewImage.id` build: `https://miro.medium.com/v2/<id>`.

### Lazy-loading behavior

- Initial render: 10 items.
- After 15 viewport scrolls: 30 items.
- After 40 scrolls: 80 items with `pagingInfo.next.from: "80"`, showing the stream can continue.
- Loading up to 100 items is feasible by scrolling until `items.length >= limit` or `pagingInfo.next` is absent.

## Failure Signals

- `MISSING_PARAM`: `topic` parameter missing or empty.
- `INVALID_PARAM`: `limit` not an integer or outside 1–100.
- `TAG_NOT_FOUND`: `tagFromSlug(...)` returns `null` in `ROOT_QUERY`.
- `PAGE_LOAD_FAILED`: Apollo client cache not available within timeout.
- `EMPTY_RESULT`: Feed exists but contains no valid posts after extraction.
- `DRIFT_DETECTED`: Expected `TagViewerEdge` or `recommendedPostsFeed` keys missing from cache.

## Capture Assessment

`/tag/<slug>/recommended` provides a lazy-loading recommended stream with full engagement metrics via the Apollo Client live cache. The path is stable, parameterizable by topic slug and limit, and supports up to 100 items through scrolling. The command should be captured to replace the old `medium/get-tag-trending` command, aligning with Medium's "topic" terminology and the command plan.
