# Evidence: facebook/get-page

This document records the research and validation evidence for the `facebook/get-page` command.

## Exploration Path

- Library check: `websculpt command list facebook` shows existing `facebook/get-feed`, `facebook/get-group`, `facebook/get-post`, `facebook/search`. No `facebook/get-page` exists; the command is new.
- Explored with `@playwright/cli` attaching the user's Chrome (`<session>`), reusing the active Facebook login. Parallel explore sessions shared the same Chrome; their tabs were never touched.
- Verified in an explore workspace (assess passed).

## Verified URLs

- `https://www.facebook.com/Meta/` — posts tab (default landing), timeline of posts.
- `https://www.facebook.com/Meta/about` — about tab, structured intro.
- `https://www.facebook.com/Meta/directory_contact_info` — contact info directory sub-page.
- `https://www.facebook.com/Meta/photos` — photos tab, photo grid.
- `https://www.facebook.com/Meta/reels_tab` — reels tab; redirects to `https://www.facebook.com/Meta/reels/`.
- `https://www.facebook.com/Meta/followers` — followers tab, follower list.
- `https://www.facebook.com/Wikipedia/` — mid-size page (redirects to `/wikipedia/`), posts + about generalization.
- `https://www.facebook.com/wikipedia/about` — mid-size page about tab.
- `https://www.facebook.com/thispagedoesnotexist12345xyz/` — invalid page, error signal.

## Structural Evidence

Tab → URL mapping (path-based, unlike personal profiles which use `sk=`):
- `posts` → `/{page}/` (the "全部"/All tab, default landing)
- `about` → `/{page}/about`
- `photos` → `/{page}/photos`
- `reels` → `/{page}/reels_tab` (auto-redirects to `/{page}/reels/`)
- `followers` → `/{page}/followers`

**posts tab**:
- No `div[role="feed"]` container on public pages (unlike the home feed). Posts render directly as top-level `div[role="article"]` under `[role="main"]`. Window scroll works.
- Main post detection: a `div[role="article"]` that is NOT nested inside another `role="article"` (top-level) AND contains a permalink anchor matching `/posts/|permalink.php|/watch/?v=|/reel/|/videos/`. Comments/replies are nested inside the main post article and have no `data-ad-preview="message"`. Top-level articles without a permalink are non-post cards (e.g., suggested pages) and must be skipped.
- Post text anchor: `[data-ad-preview="message"]`. Photo/event posts may lack it (fallback to first non-comment `div[dir="auto"]`).
- Permalink forms: `https://www.facebook.com/{page}/posts/{pfbid}` (text/photo posts), `/reel/{id}` (reel posts), `/videos/{id}` (video posts). Strip tracking params (`__cft__[0]=...`, `__tn__`, `s=ifu`).
- Time: permalink anchor text or aria-label (localized relative time, e.g., "3天", "6天").
- Media: photos via `a[href*="/photo/"] img` (srcset first candidate) and `video` poster.
- Header: page name + verified badge ("已认证账户"), follower link `a[href*="/followers"]` → "1 亿位粉丝", category ("公司"), description.
- Infinite scroll confirmed (article count 5→11 after one scroll; same GraphQL paging as home feed).

**about tab**:
- All content in DOM at once; no scrolling needed.
- Stable anchor: follower link `a[href*="/followers"]` → follower count text + `https://www.facebook.com/{page}/followers/` URL.
- Page name: page avatar `svg[role="img"][aria-label]` (the header avatar; the left-nav personal avatar has aria-label "你的个人主页" and must be excluded).
- Category: short text leaf after the description (e.g., "公司", "非营利组织").
- Description: long text leaf (e.g., "Connect with what you love to make things happen.").
- Verified: main text contains "已认证账户".
- Directory sub-pages (left nav): `/directory_intro`, `/directory_category`, `/directory_basic_info`, `/directory_links`, `/directory_contact_info`, `/directory_privacy_and_legal_info`. Contact info (social media links) lives on `/directory_contact_info`.
- Follower count normalization: "1 亿", "543 万", "3.4 万", "2,900", "45 万" → 亿/万/K/M/digits.

**photos tab**:
- Sub-tabs: "Meta 拍的照片" (Photos by page, selected) / "有标记的照片" (Tagged) / "相册" (Albums).
- Photo grid items: `a[href]` containing `img`. Two permalink forms:
  - New-style `/photo/?fbid={fbid}&set=a.{albumId}` (cover photo)
  - Old-style `photo.php?fbid={fbid}&set=pb.{pageId}.{ts}` (grid photos; 2 initially, 40 after one scroll)
- Photo item fields: `{url: permalink, imageUrl: img src (scontent... thumbnail)}`. Lazy-load on scroll.

**reels tab**:
- `/{page}/reels_tab` auto-redirects to `/{page}/reels/`.
- Reel items: `a[href*="/reel/"]` matching `/reel/{id}/`. Fields: `{url: /reel/{id}/, imageUrl: img src (scontent t15 video thumb), views: card text like "3.4 万"}`. No title text on grid cards (only play count).

**followers tab**:
- `/{page}/followers` direct. Sub-filter tabs: "粉丝" (followers, selected) / "已关注" (following).
- Disclaimer: only a subset of followers is shown.
- Follower card: `A[role="link"]` containing avatar IMG + name SPAN + optional descriptor DIV (location/category). URL is `/profile.php?id=...` or vanity `/{name}`.
- Fields: `{name, url, descriptor?}`. List is short for large pages (partial=true is normal).

**Generalization**: Wikipedia (~5.43M followers) verified posts + about with identical anchors; follower text format varies with scale ("1 亿位粉丝" vs "543 万位粉丝").

## Failure Signals

- Invalid/removed page: URL does not redirect; page title stays just "Facebook" (no page name). `[role="main"]` shows "内容暂时无法显示" (content currently unavailable) with buttons "前往动态 / 返回 / 访问帮助中心". No follower link, no posts, no page name. Detect → `PAGE_NOT_FOUND`.
- Login required: body contains "log into facebook" / "登录 facebook" / "sign up for facebook" → `AUTH_REQUIRED`.
- Account check / temp block: "temporarily locked" / "checkpoint" / "确认你的身份" / "security check" → `ACCESS_BLOCKED`.
- No stable class names anywhere; the site uses GraphQL + obfuscated classes. Only ARIA roles, `data-ad-preview`, URL path structure, and `a[href*="/followers"]` are stable.
- Reels tab may show few items (Meta had ~10); followers list is partial for large pages — `partial: true` is expected, not an error.
- Facebook rate-limits strictly; keep per-tab samples small, use natural scroll pacing, and stop on any checkpoint page.

## Capture Assessment

This command should be captured: reading a Facebook public Page's timeline and sub-pages is a common, repeated task and the path-based URL mechanism is stable and verified across two page sizes. It complements existing `facebook/search` (page discovery) and `facebook/get-post` (single post detail). Runtime is `browser` because content requires the user's Facebook login and JS rendering.
