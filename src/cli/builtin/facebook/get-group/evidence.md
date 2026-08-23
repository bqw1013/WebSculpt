# Evidence: facebook/get-group

This document records the research and validation evidence for the `facebook/get-group` command.

## Exploration Path

- Explore workspace: `<explore-workspace>` (assessed `passed`).
- Command library checked: `websculpt command list facebook` → only `facebook/search` exists; `facebook/get-group` is a new command.
- Runtime: `browser` via `@playwright/cli` attach to user Chrome, reusing the active Facebook login session. Playwright CLI version 0.1.13.
- Browser session `<session>` was created, attached, and cleaned up (own tab closed, detached) after exploration.

## Verified URLs

- https://www.facebook.com/groups/travelingtheworlds/ — public group detail page; verified name, member count, privacy, about, and a 7-post feed.
- https://www.facebook.com/groups/travelingtheworlds/permalink/1999547694084072/ — group post permalink form; verified it resolves and is consumable by `facebook/get-post`.
- https://www.facebook.com/groups/1228968151412016/ — a second public group; verified the header anchors are consistent.
- https://www.facebook.com/search/groups/?q=buy%20nothing — group search results; verified the result-card pattern `{name} {公开|私密} · {count} · {posts/day}`.
- https://www.facebook.com/groups/discover/ — group discovery page; only public groups surfaced in this session.

## Structural Evidence

All anchors are role/attribute/URL based; Facebook uses obfuscated class names throughout, so the contract does not depend on any class name.

Group header (stable combined element, Chinese UI):
- Text pattern: `{group name} {公开小组|私密小组} · {member count} 位成员 加入小组 分享`.
- Group name: first `h1` inside `[role=main]` whose text is not `通知`.
- Members: regex `/([0-9][0-9.,]*)\s*(万|K)?\s*位?成员/` → `34.5 万位成员` = 345000; `1,678 位成员` = 1678.
- Privacy: contains `公开小组` → `"public"`; contains `私密小组` → `"private"`.
- About: sidebar long-description div (no stable role/aria/data-ad-preview), heuristic: text length 50-400, matches /join|welcome|group|欢迎|加入|小组/i, not containing `任何人`; may end with `展开` truncation.

Posts (feed):
- Each post container: `div[role="article"]`. Filter real posts by presence of a link matching `/groups/{gid}/posts/{postId}/` WITHOUT `comment_id` (comment articles carry `comment_id`; some `role=article` are non-posts).
- Author: `a[href="/groups/{gid}/user/{uid}/"]`; among multiple user links pick the one with visible text (the name). Author URL = that link.
- Time: short-text link (e.g. `4小时`, `12小时`) whose href equals the post permalink.
- Permalink in feed: `/groups/{gid}/posts/{postId}/`. Verified normalized form `/groups/{gid}/permalink/{postId}/` also resolves — output uses the permalink form.
- Text cascade:
  1. `div[data-ad-preview="message"]` innerText (cleanest, but only present on some posts).
  2. After cloning the article and removing nested `[role=article]` (comments), first meaningful `div[dir="auto"]` (exclude 查看翻译/查看更多评论/发表公开评论/纯数字/赞评论分享回复). Hashtag posts duplicate text (`#X#X`) → half-dedupe.
  3. Fallback: longest leaf text `div` (exclude ones starting with author name, containing 发表公开评论/查看翻译, starting with 分享对象, equal to `AI 内容`, or pure numbers).
- Media: `img[src*="scontent"]` / `img[src*="fbcdn"]` and `video`. Exclude emoji images (`static.xx.fbcdn.net/images/emoji.php/`); keep real CDN images (`scontent-*.xx.fbcdn.net`).
- Stats: the group feed shows only action-button labels (赞/评论/分享), not counts. `stats` is best-effort and may be empty; full stats require the post detail page via `facebook/get-post`.

Loading mechanism:
- Group feed is scroll-lazy-loaded AND DOM-virtualized: initial navigation shows ~1 post; scrolling loads more; posts scrolled far out of view are removed from the DOM. The command must extract incrementally while scrolling (collect current DOM per scroll batch, dedupe by postId) — it cannot scroll to the bottom and then read everything.
- Polite pacing: random mousewheel deltas + occasional mouse moves + 1-3s natural sleeps trigger loading without tripping Facebook rate limits.

## Failure Signals

- `BROWSER_ATTACH_REQUIRED`: the command could not CDP-attach to the user's Chrome (remote debugging off, or the first-connect system confirmation dialog was not handled). Runner-level error.
- Non-existent group: title contains `找不到` / `Page not found`, or no group-name `h1` / no combined header meta after load → command throws `NOT_FOUND`.
- Private group not joined: header shows `私密小组`, no `[role=feed]`/`[role=article]` posts → command returns `privacy: "private"` with empty `posts` and `partial: true`.
- Rate limiting / temporary freeze: page shows a checkpoint or stops loading new posts on scroll while not exhausted → stop scrolling, return what was collected with `partial: true`; record observation.
- Structural drift: expected anchors (combined header meta, `[role=article]`) missing on a reachable group page → `DRIFT_DETECTED`.

## Capture Assessment

This command should be captured. The path was verified end-to-end in explore: group info (name, members, privacy, about) and the post feed (author, text, permalink, time, media) were extracted from a real public group with multiple languages (Arabic, Hindi, English, Chinese). The command fills a clear gap (there is no group command in the library), composes well with `facebook/search` (discovery) and `facebook/get-post` (single post detail/comments), and the extraction logic is reusable with stable role/attribute/URL anchors.
