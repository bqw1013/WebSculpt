# Context

## Precipitation Background (Why This Command Exists)

Reading a Facebook public Page (brand, media outlet, public figure) is a common, repeated task. Public Pages are where Facebook's most concentrated public content lives, and their sub-pages (about/photos/reels/followers) use path-based URLs, unlike personal profiles which use `sk=` parameters — so a dedicated `get-page` command keeps the interface aligned with the site's own structure. It completes the Facebook command family: `search --type pages` discovers Pages → `get-page` pulls a timeline/sub-pages → `get-post` reads a single post's full text and comments.

## Value Assessment

- Reuse: high — checking any public Page (brand monitoring, media, public figures) across its 5 sub-pages.
- Saves repeated manual scrolling and ad-hoc scraping each time.
- Reuses the verified extraction logic from `facebook/get-feed` (post structure) and `facebook/get-post` (permalink consumption).

## Page Structure

- Posts tab `/{page}/`: posts are **top-level** `div[role="article"]` under `[role="main"]`; there is **no `div[role="feed"]`** on public Pages (that container is home-feed only). Comments are nested inside the main post article. Main-post detection: top-level article + a permalink anchor (`/posts/`, `/reel/`, `/videos/`, `/watch/?v=`, `permalink.php`). Text anchor `[data-ad-preview="message"]`; photo/event posts may lack it → fallback to the longest non-comment `div[dir="auto"]`.
- About tab `/{page}/about`: content is in the DOM without scrolling. Header card: name + verified badge, follower link `a[href*="/followers"]`, buttons, description (long leaf), category (short leaf after description). Directory sub-pages under `/directory_*` hold detail/contact info.
- Photos tab `/{page}/photos`: grid of `a[href] > img`, permalinks are `photo.php?fbid={id}` or `/photo/?fbid={id}`. Sub-tabs: photos by page / tagged / albums.
- Reels tab `/{page}/reels_tab`: redirects to `/{page}/reels/`; grid of `a[href*="/reel/"]` matching `/reel/{id}/`, each with a thumbnail and a play-count card text.
- Followers tab `/{page}/followers`: follower cards are profile links with name + optional descriptor (location/category). Only a subset of followers is shown (large Pages → short list).

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled and an active Facebook login (all tabs need the login session).
- Facebook is strict about automation. The command keeps samples small (default 20), scrolls with randomized mouse-move + wheel + window scroll and natural delays, and stops on any checkpoint/block page.

## Failure Signals

- Page not found / removed: no follower link, `[role="main"]` shows "内容暂时无法显示" (content currently unavailable) with buttons 前往动态/返回/访问帮助中心 → `PAGE_NOT_FOUND`.
- Not logged in: body contains "log into facebook" / "登录 facebook" → `AUTH_REQUIRED`.
- Account check / temp block: "temporarily locked", "checkpoint", "确认你的身份", "security check" → `ACCESS_BLOCKED`.
- Drift: header `a[href*="/followers"]` absent without any known error text → `DRIFT_DETECTED`.
- Reels may have few items and followers is partial for large Pages — `partial=true` is expected, not an error.

## Repair Clues

- If post extraction misses photo/event posts, widen the `div[dir="auto"]` fallback; event-post images link to `/events/` (not `/photo/`), so their `media` may legitimately be empty. Life-event posts (e.g. "Moved to United States") have no `data-ad-preview` and no `div[dir="auto"]` text → `text` is null for them (acceptable; the permalink/author/time still extract).
- About `description` is the LONGEST clean text element (≥30 chars, contains a space, no button/follower noise) inside the overview card (first ancestor of the follower link whose innerText ≥ 50). Do NOT require it to be a leaf or start with a letter — some descriptions are emoji-prefixed and multi-line (verified on a small page). The category is the first short (2-20 chars) non-ignored text after the description element.
- About `name` comes from the page avatar `[role="img"][aria-label]` (exclude "你的个人主页"/"your profile"); `verified` from `svg[title]` or aria-label containing "已认证"/"verified" (the badge is not text in the body).
- Followers: name links use **protocol-relative hrefs** (`//www.facebook.com/profile.php?...`) — normalize `//` → `https://` before URL matching. The follower card is two sibling links (avatar link with img + empty text, name link with text + no img); the avatar is in the card ancestor (walk up to 6 levels). Filter out `l.facebook.com` redirect links and header buttons by requiring `https://www.facebook.com/` + an avatar img.
- The scroll-collect loop must stop early when a list yields nothing (a followers page with no visible cards used to scroll 45× / 163s). It now stops after 4 empty rounds.
- Permalinks can be fed to `facebook/get-post`; if Facebook switches sub-page URL shapes, update the tab→path map and re-verify against `facebook/search --type pages` discovery.
