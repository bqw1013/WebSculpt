# Context

## Precipitation Background (Why This Command Exists)

Facebook's home feed is the platform's core content-consumption surface, but the WebSculpt command library only covered `facebook/search`. The `facebook/get-feed` command fills this gap: read the algorithmic timeline at `https://www.facebook.com/` as structured posts, without needing to know author IDs or page names up front. The contract and DOM anchors were verified first-hand during the explore phase.

## Value Assessment

High reuse value: the home feed is where a Facebook user sees most content daily. `get-feed` returns author name/URL, text, permalink, time, media and engagement stats in one call. Permalinks feed directly into `facebook/get-post` for full text and comments (note: video posts produce `/watch/?v={id}` permalinks, which `get-post` should also accept). Algorithmically sorted, no pagination/order params to expose.

## Page Structure

- Home: `https://www.facebook.com/` (login required).
- Feed container: `div[role="feed"]`; each post is a descendant `div[role="article"]`.
- Initial screen loads ~3 posts; scrolling loads more (verified 3 → 16 → 17). Feed is infinite; a "已全部看完" / "You're all caught up" message marks the true end.
- Stable anchors (do NOT rely on class names — Facebook is fully GraphQL + obfuscated classes):
  - Message text: `[data-ad-preview="message"]` innerText; strip trailing `… 展开` / `… See more`.
  - Permalink: first `<a>` whose href matches `/{page}/posts/{pfbid}`, `permalink.php?story_fbid=..&id=..`, `/watch/?v={id}`, `/reel/{id}`, `/videos/{id}`, `/groups/{gid}/permalink/{pid}/`. Strip `__cft__`/`__tn__` (all `__`-prefixed) params and `s=ifu`.
  - Author: first `<a>` with visible text pointing at a single-segment profile URL (`/name` or `profile.php?id=..`), excluding post/photo/story/watch/reel/hashtag links.
  - Time: permalink link's `aria-label` or innerText (localized, e.g. "20小时", "4天", "6月12日").
  - Stats: `[role="button"]` elements whose innerText is a bare count (regex `^[\d.,]+\s*(万|千|K|M)?$`); first three in DOM order = likes/comments/shares. Values keep localized notation ("4.5万" = 45k).
  - Photo media: `a[href*="/photo/"] img` src (prefer srcset first candidate).
  - Video media: `video[poster]` poster URL.
- Non-post `div[role="article"]` to filter: empty loading placeholders, and Reels recommendation rails (text "Reels", many `/reel/` links, no author/message/media).

## Environment Dependencies

- Browser runtime: the command connects over CDP to the user's Chrome/Edge; requires remote debugging enabled and an active Facebook login (manifest `authRequired: required`). First CDP attach may trigger a system "allow remote debugging" confirmation dialog.
- Polite pacing (policy): natural randomized scrolling (mouse move + wheel), random pauses, restrained request frequency. Facebook rate limiting is strict; do not hammer.
- Parallel facebook commands (`get-feed`/`get-post`/`get-group`) share the same Chrome session — run tests serially with random delays between batches.

## Failure Signals

- No `div[role="feed"]` within 15s → likely login wall, account check, or structure drift.
  - Body contains "Log into Facebook"/"登录 Facebook" → `AUTH_REQUIRED`.
  - Body contains "temporarily locked"/"checkpoint"/"确认你的身份" → `ACCESS_BLOCKED`.
  - Otherwise → `DRIFT_DETECTED`.
- Consecutive scrolls returning no new posts (3 in a row) → treat as exhausted (`partial=true`).
- Login wall / CAPTCHA / temp block can also manifest as the feed selector never appearing or posts never loading.

## Repair Clues

- Re-check that the extraction still uses only stable anchors; re-verify on `https://www.facebook.com/` with the user's browser (per the explore pattern).
- If permalink forms change, extend `isPostLink` in `command.js`.
- If the stats action bar layout changes, re-map the three count buttons; keep the `万/千/K/M` suffix support.
- If the feed loads faster/slower, tune `MAX_ATTEMPTS`, `staleScrolls` threshold, and `waitRandom` delays.
