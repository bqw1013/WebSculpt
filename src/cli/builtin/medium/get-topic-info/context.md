# Context

## Precipitation Background

The existing `medium/get-topic-trending` command only covers the hot/recommended article stream for a topic. Users also need topic metadata (followers, related topics), the list of authors/publications Medium recommends for a topic, and the chronological archive. This command fills that gap.

## Value Assessment

The three sections map to three distinct user tasks and reuse stable `/tag/<slug>` URL patterns. Once captured, they save repeated browser exploration for common Medium topic lookups.

## Page Structure

- Topic info: `https://medium.com/tag/<slug>`
  - Apollo `Tag:<slug>` holds `displayTitle`, `followerCount`, `postCount`, `parentTag`.
  - Related topics are links under `/tag/<slug>` in the topic-nav bar near the top.
- Who to follow: `https://medium.com/tag/<slug>/who-to-follow`
  - Apollo `ROOT_QUERY` has `recommendedPublishers({"first":100,"mode":"ALL","tagSlug":"<slug>"})`.
  - Edges alternate `User` and `Collection` nodes.
- Archive: `https://medium.com/tag/<slug>/archive`
  - Apollo `Tag:<slug>` has `posts:{"sortOrder":"NEWEST","timeRange":{"kind":"ALL_TIME"}}`.
  - Scroll to load more; stream may stop early due to GraphQL rate limiting or Cloudflare challenges.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled.
- No login required.
- Public pages only; member-only articles return metadata with `isMemberOnly: true`.

## Failure Signals

- 404 / missing topic: page body contains `PAGE NOT FOUND` and `404`, no `Tag:<slug>` object.
- Missing Apollo cache keys → `PAGE_LOAD_FAILED` / `DRIFT_DETECTED`.
- Empty who-to-follow list → `EMPTY_RESULT`.
- Archive stream exhausted early → return `partial: true`.

## Repair Clues

- If Apollo cache keys change, verify `Tag:<slug>` and `ROOT_QUERY` keys on the target pages.
- If follower counts disappear from the DOM, the command already falls back to `null`.
- If archive stops loading, check whether Medium changed the sort key from `NEWEST` or introduced new pagination.
