# Evidence: hackernews/get-thread

This document records the research and validation evidence for the `hackernews/get-thread` command.

## Exploration Path

Checked the existing Hacker News command library first. `hackernews/get-comments` is a global newest-comments feed and `hackernews/search` returns search cards; neither reads one story's complete discussion. Existing `hackernews/get-ask` and `hackernews/get-new` use the same public Firebase API and node runtime.

## Verified URLs

The verified source endpoints were:

- https://hacker-news.firebaseio.com/v0/item/49104747.json (Show HN story with text, URL, `kids`, and `descendants`)
- https://hacker-news.firebaseio.com/v0/item/49104392.json (Ask HN self-post with text and child comment IDs)
- https://hacker-news.firebaseio.com/v0/item/49105621.json (story with zero descendants and no `kids` field)
- https://hacker-news.firebaseio.com/v0/item/49105723.json (live child comment with `parent` and `text`)
- https://hacker-news.firebaseio.com/v0/item/49105088.json (dead/flagged comment case)
- https://news.ycombinator.com/item?id=49104747 (canonical item URL shape)
- https://news.ycombinator.com/item?id=49104392 (canonical item URL shape)

## Structural Evidence

The public Firebase endpoint is `https://hacker-news.firebaseio.com/v0/item/<id>.json`.

Verified story fields: numeric `id`, `type: "story"`, `by`, Unix `time`, optional `title`, optional `url`, optional HTML `text`, numeric `score`, optional numeric `descendants`, and optional numeric `kids` array.

Verified comment fields: numeric `id`, `type: "comment"`, `by`, Unix `time`, numeric `parent`, HTML `text`, and optional `kids` array. A child can itself have children, so the command must recurse. The `kids` array may include a dead node; for example item `49105088` returned `dead: true` and text `[flagged]`. Such nodes are excluded from the normal comments result.

The captured output will preserve HN order by traversing each `kids` array in order, flatten comments with `depth` and `parentId`, and include `totalComments` from the root's `descendants` when present.

## Failure Signals

Known failure signals and handling requirements:

- Missing or malformed `id`/`url`: `MISSING_PARAM` or `INVALID_PARAM`.
- Both `id` and `url` supplied, or an URL outside `news.ycombinator.com/item?id=...`: `INVALID_PARAM`.
- Root item not found, deleted, dead, or not a story: `NOT_FOUND` or `INVALID_ITEM`.
- HTTP 429: `RATE_LIMITED`.
- Other non-success response or network timeout after one retry: `API_ERROR` or `NETWORK_ERROR`.
- Invalid JSON, missing required root fields, or unexpected child shape: `DRIFT_DETECTED`.
- A child that is deleted/dead/malformed is skipped; a partial live result is returned with `truncated: true` when the comment limit is reached or child data is unavailable.
- `limit` is bounded to 1–200 to avoid unbounded recursive API traffic.

## Capture Assessment

Capture approved. The public Firebase path is reproducible for story IDs and canonical HN item URLs, covers link posts, self-posts, nested comments, zero-comment stories, and dead-comment filtering, and complements rather than conflicts with the existing HN commands. The command is read-only, requires no login, and has explicit bounds and drift/error signals.
