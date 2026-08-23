# Evidence: medium/get-topic-info

## Exploration Path

Checked the WebSculpt command library (`websculpt command list medium`) for overlapping commands. `medium/get-topic-trending` covers the recommended/trending article stream, and `medium/list-topics` covers topic discovery, but no command provides topic metadata, recommended authors/publications, or the chronological archive.

Read the browser access guide before browser operations. Attached to the user's Chrome with a dedicated session and reused a single self-created tab across navigations.

## Verified URLs

- `https://medium.com/tag/artificial-intelligence`
- `https://medium.com/tag/artificial-intelligence/who-to-follow`
- `https://medium.com/tag/artificial-intelligence/archive`
- `https://medium.com/tag/programming`
- `https://medium.com/tag/this-topic-definitely-does-not-exist-12345` (404 reference)

## Structural Evidence

### Topic metadata (`info`) on `/tag/<slug>`

`window.__APOLLO_STATE__` contains a `Tag:<slug>` node with:

- `id` / `normalizedTagSlug`: topic slug
- `displayTitle`: human-readable topic name
- `followerCount`: number of followers
- `postCount`: number of stories
- `parentTag`: parent topic reference

Example (`artificial-intelligence`):

```json
{
  "__typename": "Tag",
  "id": "artificial-intelligence",
  "displayTitle": "Artificial Intelligence",
  "postCount": 501066,
  "followerCount": 9433537,
  "parentTag": { "__ref": "Tag:technology" }
}
```

Related topics are rendered as a horizontal topic-nav bar of `/tag/<slug>` links near the top of the page. Implementation filters out the current topic and helper links such as "See more recommended stories".

### Recommended authors/publications (`who-to-follow`) on `/tag/<slug>/who-to-follow`

`ROOT_QUERY` contains a single `recommendedPublishers({"after":"","first":100,"mode":"ALL","tagSlug":"<slug>"})` connection with up to 100 edges. Edges alternate between `User` and `Collection` nodes.

User nodes provide `name`, `username`, `bio`, `imageId`. Collection nodes provide `name`, `slug`, `description`, `avatar`, `domain`. Follower counts are not present in Apollo state; the DOM sometimes renders a followers paragraph and sometimes omits it, so the command extracts it from the DOM when available and falls back to `null`.

### Chronological archive (`archive`) on `/tag/<slug>/archive`

`Tag:<slug>` contains a `posts:{"sortOrder":"NEWEST","timeRange":{"kind":"ALL_TIME"}}` connection. Each edge points to a `Post:<id>` node with:

- `title`, `mediumUrl`, `firstPublishedAt`, `latestPublishedAt`
- `creator` (User reference)
- `collection` (Collection reference, often `null`)
- `previewImage` (`id`)
- `extendedPreviewContent.subtitle`
- `clapCount`, `postResponses.count`
- `readingTime`
- `isLocked` / `visibility` (member-only flag)

The page renders an initial batch of ~10 posts; scrolling can load additional batches. GraphQL continuation requests may be blocked by Cloudflare in some sessions, so the command treats archive extraction as best-effort and returns `partial: true` when fewer than the requested number of items are collected.

## Failure Signals

- Non-existent topic: page body contains `PAGE NOT FOUND` and `404`, no `Tag:<slug>` object in Apollo state.
- Missing Apollo cache or expected keys → `PAGE_LOAD_FAILED` / `DRIFT_DETECTED`.
- Empty who-to-follow list → `EMPTY_RESULT`.
- Archive stream exhausted early → return collected items with `partial: true`.

## Capture Assessment

This command should be captured. The three sections correspond to clearly distinct user tasks (metadata lookup, discovery of recommended publishers, chronological article stream) and complement the existing `medium/get-topic-trending` command. All three views are reachable via stable `/tag/<slug>` URL patterns and expose structured data through the embedded Apollo state.
