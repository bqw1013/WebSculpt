# Evidence: facebook/get-feed

This document records the research and validation evidence for the `facebook/get-feed` command.

## Exploration Path

Read the explore access guide before exploration.

- Explore workspace: `<explore-workspace>` (audit passed, candidate `facebook/get-feed`).
- Library check: only `facebook/search` existed for the facebook domain; `facebook/get-feed` is new.
- Tooling: `@playwright/cli` attached to the user's Chrome session (`<session>`) to reuse the Facebook login state; verified the page and extraction first-hand on 2026-08-08.
- Extraction logic validated in-page on 3 → 16 → 17 feed articles; 14 real posts extracted from 17 articles (3 non-posts filtered).
- Browser runtime contract read before writing `command.js`.

## Verified URLs

- `https://www.facebook.com/` — home feed container `div[role="feed"]`, per-post `div[role="article"]`, infinite scroll, message/permalink/stats/media anchors all verified here.

## Structural Evidence

Feed layout (verified first-hand):
- Feed container: `div[role="feed"]`, children: an `H3` header ("动态帖子") plus a posts wrapper `DIV`.
- Each post: `div[role="article"]` inside the feed. Initial ~3 posts, grows on scroll (3 → 16 → 17). End-of-feed message "已全部看完" / "You're all caught up" marks exhaustion.
- Non-post `div[role="article"]` that must be filtered: empty loading placeholders (no text/links) and Reels recommendation rails (innerText "Reels", multiple `/reel/` links, no author/message/media).

Extraction anchors (no class names — Facebook uses obfuscated classes everywhere):
- Message: `[data-ad-preview="message"]` innerText; strip trailing `… 展开`/`… See more`/`… More`/`… 继续阅读`.
- Permalink: first `<a>` matching `/\/posts\/|permalink\.php|\/watch\/\?v=|\/reel\/|\/videos\/|\/groups\/[^/]+\/permalink\//`. Observed forms in one feed: `/posts/{pfbid}` (10 articles), `/watch/?v={id}` video posts (3), `/reel/{id}` (Reels rail). Clean by dropping `__`-prefixed query params and `s=ifu`.
- Author: first `<a>` with non-empty short visible text whose path is a single segment (`/name` or `/profile.php?id=..`) and which is not a post/photo/story/watch/reel/hashtag/help link.
- Time: permalink link's `aria-label` (or innerText) — localized relative time ("20小时", "4天", "6月12日").
- Stats: `[role="button"]` elements whose innerText is a bare count matching `^[\d.,]+\s*(万|千|K|M)?$`; first three in DOM order are likes, comments, shares. Observed counts "7,242", "418", "501", and "4.5万" (45k) for large likes.
- Photo media: `a[href*="/photo/"] img`, use srcset first candidate or src.
- Video media: `video[poster]` poster URL (CDN thumbnail). Video post permalink is `/watch/?v={id}`.

Sample validated extraction (real data):
```json
[
  { "author": { "name": "BBC Bristol", "url": "https://www.facebook.com/BristolBBC" }, "text": "Look at them go \nWhere did you watch them from this morning?", "permalink": "https://www.facebook.com/BristolBBC/posts/pfbid038H9R6r7TwXMtf9UjcNiFUJ5wWAjPsH1VXnHqmNeX1VSBBLMg3Sg6NdVwnDgiAaS1l", "time": "20小时", "stats": { "likes": "7,242", "comments": "418", "shares": "501" }, "media": [ { "type": "photo", "url": "https://scontent-cgk1-1.xx.fbcdn.net/..." } ] },
  { "author": { "name": "Milestrong", "url": "https://www.facebook.com/profile.php?id=61561116032578" }, "text": "Everyone has a different way of watching World Cup matches.#MileStrong ...", "permalink": "https://www.facebook.com/watch/?v=27023317513963588", "time": "6月12日", "stats": { "likes": "4.5万", "comments": "896", "shares": "2,049" }, "media": [ { "type": "video", "url": "https://scontent-cgk2-1.xx.fbcdn.net/..." } ] }
]
```

## Failure Signals

- Feed selector `div[role="feed"]` not found within 15s:
  - "Log into Facebook" / "登录 Facebook" present → login required (`AUTH_REQUIRED`).
  - "temporarily locked" / "checkpoint" / "确认你的身份" present → account check/block (`ACCESS_BLOCKED`).
  - Otherwise → `DRIFT_DETECTED` (structure changed).
- 3 consecutive scrolls with no new posts → feed exhausted → `partial=true`.
- Facebook rate limiting: check pages, CAPTCHA, or temporary freezes can appear under aggressive automation. Mitigations: polite randomized scrolls, random pauses, restrained sampling.

## Capture Assessment

This command should be captured. The home feed is a high-frequency, high-value Facebook surface not previously covered. The path is verified first-hand with a stable anchor set (ARIA roles / data-ad-preview / URL structure), the extraction produced consistent structured output across 14 real posts, and the parameterization (limit + internal scrolling + partial flag) maps cleanly to a CLI command. Cross-command value: permalinks chain into `facebook/get-post`.
