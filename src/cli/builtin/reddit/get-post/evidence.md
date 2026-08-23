# Evidence: reddit/get-post

This document records the research and validation evidence for the `reddit/get-post` command.

## Exploration Path

- Checked the WebSculpt command library with `websculpt command list reddit`; no existing `reddit/get-post` command was found.
- Attached Playwright CLI to the user's Chrome via CDP using session `<session>`.
- Opened a dedicated tab and visited multiple Reddit post detail pages to validate DOM structure, parameter behaviour, and extraction stability.

## Verified URLs

- `https://www.reddit.com/r/juridischadvies/comments/1f6b5k3/conflict_met_buren_van_vriendin_om_kittens/`
- `https://www.reddit.com/r/juridischadvies/comments/1f6b5k3/conflict_met_buren_van_vriendin_om_kittens/?sort=top`
- `https://www.reddit.com/r/juridischadvies/comments/1f6b5k3/conflict_met_buren_van_vriendin_om_kittens/?sort=new`
- `https://www.reddit.com/r/juridischadvies/comments/1f6b5k3/conflict_met_buren_van_vriendin_om_kittens/?sort=best&depth=1`
- `https://www.reddit.com/r/AskReddit/comments/1v7z1m7/what_industry_is_secretly_on_the_verge_of/`
- `https://www.reddit.com/r/technology/comments/1v8dm6x/high_school_teacher_arrested_for_clapping_in/`

## Structural Evidence

### Post container

- Each post detail page renders a single `<shreddit-post>` element.
- Verified attributes on `<shreddit-post>`:
  - `id` (e.g. `t3_1f6b5k3`)
  - `post-title`
  - `author`
  - `subreddit-prefixed-name` (e.g. `r/juridischadvies`)
  - `score`
  - `comment-count`
  - `created-timestamp`
  - `post-type` (`text` or `link`)
  - `upvote-ratio`
  - `permalink`
  - `content-href` (external URL for link posts, same page for text posts)
- For text posts, the body is inside `<div slot="text-body">` of the `<shreddit-post>`.
- For link posts, no `text-body` slot exists; the external URL is read from `content-href`.

### Comment container

- Comments are inside `<shreddit-comment-tree>`.
- `<shreddit-comment-tree>` exposes `totalcomments` and `permalink`.
- Each comment is a `<shreddit-comment>` element with attributes:
  - `thingid` (comment id, e.g. `t1_lkyx168`)
  - `author`
  - `score`
  - `depth`
  - `parentid` (present on replies, e.g. `t1_lkyx168`)
  - `permalink`
  - `created`
  - `collapsed` (present when collapsed)
- Comment body text is inside the element `[slot="comment"]` of each `<shreddit-comment>`.
- Child comments are physically nested inside their parent `<shreddit-comment>` and carry a `parentid` attribute, making reply-tree reconstruction stable.
- Collapsed comments have an empty body slot; they can be included with `collapsed: true`.

### Loading behaviour

- On a large thread (`/r/AskReddit/comments/1v7z1m7/`, 10,705 comments), only 100 comments were rendered initially.
- Scrolling to the bottom increased the rendered count to 110, confirming lazy/infinite-scroll loading for additional top-level threads.
- Individual threads also expose "X more replies" buttons for deeper replies.

### Parameter behaviour

- `?sort=top` and `?sort=new` both changed the comment order returned by the server.
- `?depth=1` did **not** remove deeper comments from the DOM; all depths (0-5) were still present. Depth filtering must be applied client-side.

## Failure Signals

- **Platform rate limiting**: page title or body text contains "You've been blocked by network security". Command should detect this, throw `BLOCKED`, and rely on the caller to retry.
- **Missing post element**: if `shreddit-post` does not appear within the timeout, the page structure may have drifted (`DRIFT_DETECTED`).
- **Invalid permalink**: malformed path or 404 page; detectable by missing `shreddit-post` after navigation.
- **Rate limiting / human verification**: Reddit may slow responses or show verification dialogs; command uses random waits and cursor movement to keep a polite pacing profile.

## Capture Assessment

This path should be captured as `reddit/get-post`. The DOM selectors are stable across text and link posts, sorting is parameterised via URL query, and comments can be extracted consistently from the rendered `<shreddit-comment>` elements. The command fills the gap in the existing Reddit command set by providing single-post detail retrieval.
