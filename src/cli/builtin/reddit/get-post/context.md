# Context

## Precipitation Background (Why This Command Exists)

The existing Reddit commands (`reddit/get-feed`, `reddit/get-popular`, `reddit/search`) return lists of posts. Users frequently need to open one of those posts and read its full content plus the comment discussion. This command captures the validated browser path for retrieving a single Reddit post detail page.

## Value Assessment

- High reuse value: any post permalink can be expanded with one command.
- Complements list/search commands without overlapping functionality.
- Saves repeated browser exploration for the same post-detail DOM pattern.

## Page Structure

- Post container: `<shreddit-post>` on the detail page.
  - Attributes: `id`, `post-title`, `author`, `subreddit-prefixed-name`, `score`, `comment-count`, `created-timestamp`, `post-type`, `upvote-ratio`, `permalink`, `content-href`.
  - Text body: `[slot="text-body"]` inside the post element.
- Comment container: `<shreddit-comment-tree>`.
  - Attribute `totalcomments` gives the total comment count reported by Reddit.
- Each comment: `<shreddit-comment>`.
  - Attributes: `thingid`, `author`, `score`, `depth`, `parentid`, `permalink`, `created`, `collapsed`.
  - Body: `[slot="comment"]` inside the comment element.
  - Children are nested inside the parent comment element and linked by `parentid`; the command builds a reply tree from `parentid`.

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled (`chrome://inspect/#remote-debugging`).
- Public posts only; login is not required.
- Uses light random waits and occasional small mouse movement to keep a polite pacing profile.
  - Initial pause after post element loads: 200–500 ms.
  - Pause between lazy-load scrolls: 300–800 ms.
  - Final pause before returning: 0–500 ms.
  - Mouse movement is triggered ~50% of the time and confined to a small central area.

## Failure Signals

- Platform rate limiting: page body/title contains "You've been blocked by network security" → `BLOCKED`.
- `<shreddit-post>` missing after timeout → `DRIFT_DETECTED` (or 404 / malformed permalink).
- Comment tree missing → comments returned as empty list.

## Repair Clues

- If selectors break, verify that Reddit still uses `<shreddit-post>` and `<shreddit-comment>` custom elements.
- If comment counts become unstable, check whether Reddit changed lazy-loading behaviour (scroll vs. "Load more" buttons).
- If sort values are rejected, confirm the supported query values on a live comment section.
