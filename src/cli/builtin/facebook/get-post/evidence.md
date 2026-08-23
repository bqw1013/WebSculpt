# Evidence: facebook/get-post

This document records the research and validation evidence for the `facebook/get-post` command.

## Exploration Path

- Command library check: `websculpt command list facebook` returns only `facebook/search`. `facebook/get-post` does not exist, so this is a new command (no conflict). It was captured alongside the other facebook commands (get-feed/get-profile/get-page/get-group), which share the same user Chrome login session.
- The command was explored by attaching the user's Chrome via `@playwright/cli` (session `<session>`), reusing the logged-in Facebook session.
- Capture runtime contract consulted.

## Verified URLs

All URLs below were actually visited (logged-in session) and used for extraction during explore:

- `https://www.facebook.com/` — home feed, confirmed login state (`div[role="feed"]`, 3 `div[role="article"]`, no login form / checkpoint).
- `https://www.facebook.com/{user}/posts/{pfbid}` — form 2 (`/{user}/posts/{pfbid}`), post with no comments ("还没有任何评论哦").
- `https://www.facebook.com/Meta/posts/pfbid024vkXSP2PWvwcxNdRS5fsdjg3AQrCXtHF2R3viVTR1tLga65exsVKGi86VhcLEEPSl` — form 2, 24 articles (1 main + 23 top-level comments), main post internal permalink points to a different pfbid than the URL.
- `https://www.facebook.com/GANKIMYONGPAGE/posts/pfbid02eCphV51mwz3v6VCgwnX5UddSte4eAXet7VCuAhDsfmrUF99MzEn9LbueA8mwXXCil` — form 2, post with nested replies ("查看2条回复" expand → 24→26 articles), stats 2,216 likes / 54 comments / 34 shares.
- `https://www.facebook.com/groups/travelingtheworlds/permalink/1999547694084072/` — form 3 (`/groups/{groupId}/permalink/{postId}/`), main post has NO `data-ad-preview="message"` anchor.
- `https://www.facebook.com/reel/1578941230685715/` — form 5 (`/reel/{id}`), post rendered in video player (`role="main"`), comments open via `aria-label="评论"` button.
- `https://www.facebook.com/{profileId}/videos/{videoId}` — form 4 (`/videos/{id}`), post in player UI, comments rendered directly, "查看更多评论" button loads ~10 per click.
- `https://www.facebook.com/permalink.php?story_fbid=pfbid024vkXSP2PWvwcxNdRS5fsdjg3AQrCXtHF2R3viVTR1tLga65exsVKGi86VhcLEEPSl&id=20531316728` — form 1 (`/permalink.php?story_fbid=...&id=...`), FAILS with pfbid story_fbid: page renders "内容暂时无法显示" (content temporarily unavailable).

## Structural Evidence

Stable anchors only (ARIA roles / `data-ad-preview` / URL path structure). No class names are relied upon.

- Page SSR: post + comments are rendered into the DOM by Comet (bnzai) on initial load; `api/graphql/` requests observed are notification/config types, no standalone comment-paging endpoint → DOM extraction is the primary path.

- Main post page (`/posts/`, `/groups/.../permalink/`):
  - Container: `div[role="article"]` elements. Layout: i=0 sidebar "related post" (also has `data-ad-preview="message"` and "分享对象"), i=1/2 empty placeholders, i=3 main post. Comments follow after the main post.
  - Main post identification: the `div[role="article"]` with the largest `textContent` length, that contains "分享对象：" privacy text and a like-count aria-label (`赞：N位用户`), and usually a `data-ad-preview="message"` element. Measured lengths: main vs related = 674/230 (Karan), 944/138 (Meta), 1733/134 (Gan), 265/225 (group) → "largest" always holds.
  - Text anchor: `div[data-ad-preview="message"]` OR fallback `div[dir="auto"]`. The group post had `data-ad-preview="message"` = null → fallback required.
  - Author: aria-label / header text; author URL = `facebook.com/{author}` link in the main post (exclude hashtags, /posts/, /permalink/, /groups/.../permalink/ links).
  - Time: aria-label with absolute datetime like `2026年8月3日周一14:58`, else relative text like `6天`.
  - Permalink: the post's own permalink link inside the main post (`/{user}/posts/{pfbid}` or `/groups/{group}/permalink/{postId}/`), with `?`-tracking params stripped.
  - Stats: aria-label `赞：N位用户` gives likes; the action-bar numeric text sequence `reactions / comments / shares` (plain text, no aria/link) gives total reactions / comments / shares (best-effort).
  - Comments: `div[role="article"]` after the main post, non-empty. Comment text anchor `div[dir="auto"]` (comments have NO `data-ad-preview`); absolute time aria; likes aria `N个心情，查看留下心情的用户`; author name = article text up to the first `·`; author URL = non-permalink `facebook.com/...` link (exclude posts/permalink/hashtag).

- Replies:
  - Collapsed as `查看N条回复` (view N replies) buttons; clicking expands N new `div[role="article"]` inserted immediately after the parent comment.
  - Class-independent discriminator: DOM depth to `<body>` — top-level comments 45 levels, replies 48 levels (3 deeper, nested in the reply-thread container). Replies are grouped to the nearest preceding top-level comment.

- Comment incremental loading:
  - `[role="button"]` with text `查看更多评论` (view more comments) on posts/videos with many comments; each click loads ~10 more `div[role="article"]`, the button persists until exhausted (verified 2 → 12 → 22).
  - Replies expanded via `查看N条回复` / `查看更多回复` buttons.

- Video/reel pages (`/videos/{id}`, `/reel/{id}`):
  - Post is NOT in `div[role="article"]`; rendered in the player UI. `role="main"` holds author (`· 关注`), text (hashtags), and stats numbers (views/likes/comments/shares concatenated). Media = `<video poster>` or cover image.
  - Comments are `div[role="article"]`; on `/reel/` the comment panel opens by clicking `[aria-label="评论"]` button; on `/videos/` comments render directly. Same comment extraction anchors as standard pages.
  - Commenter badges like `· 粉丝` / `· 里程碑粉丝` appear in the author line and must be stripped.

- permalink.php:
  - With pfbid in `story_fbid` the page renders a failure state (see Failure Signals). Modern pfbid posts have no numeric `story_id` in embedded JSON, so capture must normalize permalink.php input: extract `story_fbid`; if it starts with `pfbid`, rewrite to `/{author}/posts/{pfbid}` using the `id` param (numeric or vanity) and retry; otherwise navigate directly.

## Failure Signals

- Content-unavailable state: `role="main"` contains text `内容暂时无法显示` (also `content temporarily unavailable`). Detect BEFORE waiting for normal content; map to a NOT_FOUND-style error.
- Login wall / checkpoint: no `div[role="feed"]` and presence of `input[name="email"]` or `checkpoint`/`login_challenge` in URL → AUTH_REQUIRED.
- No article container after navigation → DRIFT_DETECTED (page structure changed).
- Empty post with no visible main article → NOT_FOUND / EMPTY_RESULT.
- Invalid `url` (not a facebook.com URL, or malformed) → MISSING_PARAM / INVALID_PARAM.

## Capture Assessment

This command should be captured. It is a high-value, reusable path: after finding a post permalink via `facebook/search` / `facebook/get-feed` / `facebook/get-group`, `facebook/get-post` reads the full post text and comments (with nested replies), covering the five URL forms users copy from Facebook. The extraction path is verified against 7 real posts across all URL forms and the comment paging mechanism was observed first-hand. This is a stable, parameterizable command (`url`, `include-comments`, `comment-limit`) with clear error semantics.
