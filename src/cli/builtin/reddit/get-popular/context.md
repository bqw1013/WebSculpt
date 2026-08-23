# Context

## Precipitation Background (Why This Command Exists)

`docs/reddit-command-needs.md` identifies the need for a command that fetches Reddit's site-wide `/r/popular/` feed. This feed is distinct from the personalized front page (`reddit/get-feed`): it surfaces posts from across Reddit that are broadly popular, without requiring a logged-in user.

## Value Assessment

`/r/popular/` is a useful default view for discovering trending content across the platform. Supporting the same sort orders as the front page (`best`, `hot`, `top`, `rising`, `new`) plus a `time` range for `top` makes the command flexible for different analysis needs.

## Page Structure

- URL pattern: `https://www.reddit.com/r/popular/{sort}/` where `{sort}` is one of `best`, `hot`, `top`, `rising`, `new`.
  - For `top`, append `?t={time}` where `{time}` is `hour`, `day`, `week`, `month`, `year`, or `all`.
- Posts are `<shreddit-post>` custom elements.
- Key attributes: `subreddit-prefixed-name`, `post-title`, `score`, `comment-count`, `permalink`, `content-href`, `author`.
- Lazy loading with virtual DOM recycling: as the user scrolls, Reddit unmounts off-screen posts and mounts new ones. The command therefore collects all unique permalinks observed during scrolling, not just the currently visible DOM count.

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled.
- Public feed access does not require Reddit login.
- Browser automation can be rate-limited or challenged by Reddit.

## Failure Signals

- Missing `shreddit-post` elements after navigation and wait timeout indicates a drift or block.
- Empty `subreddit-prefixed-name` or `post-title` on a post element indicates an ad or promoted unit; such entries are skipped.
- `INVALID_PARAM` is thrown for unsupported `sort`/`time` values or out-of-range `limit`.

## Repair Clues

- If Reddit changes `shreddit-post` structure, verify the same attributes still exist via browser devtools.
- If a sort tab is removed, remove it from `validSorts` and update the default accordingly.
- If virtual-list behavior changes, adjust the scroll-collection loop in `command.js`.
