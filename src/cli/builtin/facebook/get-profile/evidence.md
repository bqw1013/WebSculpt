# Evidence: facebook/get-profile

This document records the research and validation evidence for the `facebook/get-profile` command.

## Exploration Path

Explored via `websculpt-explore` (assess passed, capture eligible). The command library was checked: no `facebook/get-profile` existed (new command). Existing same-domain commands: facebook/search, facebook/get-feed, facebook/get-post, facebook/get-group.

Browser automation used `@playwright/cli` attaching to the user's Chrome (CDP) to reuse the Facebook login session. Two profile URL forms were verified: `/profile.php?id={uid}` (numeric ID) and `/{username}`. Key finding: the `?sk=` URL parameter works on both URL forms, so the command constructs `{baseUrl}?sk={tab}` uniformly (all tab = base URL without sk).

## Verified URLs

- `https://www.facebook.com/profile.php?id=<own-profile-id>` — a private profile (numeric ID form); verified `?sk=about/friends/photos/reels_tab` sub-pages and the tab-to-sk mapping.
- `https://www.facebook.com/leehsienloong` — Lee Hsien Loong personal profile (vanity/username form, 1.76M followers); verified username resolution, `?sk=` on vanity URLs, the `all` post stream, the about directory sub-pages, the photos/reels grids, and the followers/following lists.
- `https://www.facebook.com/leehsienloong?sk=about` and `https://www.facebook.com/leehsienloong/about` — both load the about page (sk and path forms are interchangeable).
- `https://www.facebook.com/leehsienloong?sk=followers`, `?sk=following`, `?sk=friends` — connections sub-pages.
- `https://www.facebook.com/leehsienloong/directory_work`, `/directory_personal_details`, `/directory_basic_info` — about directory sub-pages (sparse for a public figure; regular users expose location/work/education there).

## Structural Evidence

Stable anchors only (Facebook uses GraphQL + obfuscated class names; no class names are relied upon):

- Profile base URL resolution: numeric ID -> `profile.php?id={id}`; username -> `/{username}`. `?sk=` works on both.
- tab -> sk mapping (verified live): all=`<no sk>`, about=`sk=about`, photos=`sk=photos`, reels=`sk=reels_tab`, followers=`sk=followers`, following=`sk=following`, friends=`sk=friends`.
- `all` tab: the profile timeline has NO `div[role="feed"]` container (unlike the home feed). Posts are `div[role="article"]` directly on the page. Comment articles are nested inside their parent post's article (`first.contains(second) === true`), so extraction keeps only top-level articles (7 articles -> 5 top-level).
- Post anchors (shared with get-feed): author = first link to a single-segment vanity or `profile.php?id=` with visible text, excluding post/photo/reel/watch/groups/hashtag paths, tracking params stripped; text = `[data-ad-preview="message"]`; permalink = first link matching `/posts/|permalink.php|/watch/?v=|/reel/|/videos/|/groups/.../permalink/`; time = permalink aria-label or innerText; stats = `[role="button"]` with bare count text (supports 万/千/K/M); photo media = `a[href*="/photo/"] img` src; video media = `video[poster]`.
- `photos` tab: tiles are `a[href*="/photo/?fbid="]`; the image is the inner `img` src (scontent CDN). Photo viewer URL is `https://www.facebook.com/photo/?fbid={id}`.
- `reels` tab: tiles are `a[href*="/reel/"]` with a numeric id; the tile text is the play count (e.g. `27 万`); thumbnail is the inner `img` src. NOTE: reel tiles expose NO title (only play count + thumbnail + URL); aria-label is just "Reels 磁贴预览".
- followers/following tabs: the connections page has an internal tab list (粉丝/已关注) selected by the sk parameter. Each entity card contains a short action button ("关注"/"Follow" etc.) and a name link to `profile.php?id=` or a single-segment vanity URL. Extraction anchors on the action button to find the card's name link.
- `friends` tab: shows the friends page; empty state ("没有好友可显示"/"No friends to show") when the target has no visible friends; for public-figure profiles with no friends feature it falls back to the followers page content.
- `about` tab: the about page has a sub-navigation tablist (role="tab" links) whose hrefs are directory sub-pages. Numeric ID form: `?sk=directory_intro`, `?sk=directory_personal_details`, `?sk=directory_work`, `?sk=directory_education`, `?sk=directory_activites`, `?sk=directory_interests`, `?sk=directory_travel`, `?sk=directory_links`, `?sk=directory_contact_info`, `?sk=directory_names`. Vanity form: `/directory_intro`, `/directory_work`, etc. The directory page's section content is the container sibling after the sub-nav tablist. Public figures (LHL) show category (政界人士) + bio; regular users expose location/work/education in the directory sub-pages. Field sets differ by profile type, so missing fields are null/empty.

## Failure Signals

- Login wall: body text contains "Log into Facebook"/"登录 Facebook"/"Sign up for Facebook" -> AUTH_REQUIRED.
- Account check / temporary block: "temporarily locked"/"checkpoint"/"确认你的身份"/"security check" -> ACCESS_BLOCKED.
- Profile not found / inaccessible: "此内容目前无法显示"/"isn't available right now"/"the link you followed may be broken"/"对不起，找不到此页面" -> NOT_FOUND.
- Main container missing -> DRIFT_DETECTED.
- Invalid params: missing user -> MISSING_PARAM; malformed user -> INVALID_PARAM; bad tab enum -> INVALID_PARAM; limit 0/negative/non-numeric -> INVALID_PARAM; limit > 100 -> LIMIT_EXCEEDED.
- Empty lists return `partial: true` with empty arrays (friends empty state, 0-follower accounts).
- Polite pacing: Facebook is strict; the command scrolls naturally (mouse move + wheel + waitForTimeout) and keeps page loads reasonable. During exploration ~15 navigations caused no checkpoint/freeze/CAPTCHA.

## Capture Assessment

This command should be captured. It covers a distinct, high-value user task — reading a Facebook personal profile's timeline and sub-pages (bio, photos, reels, follower/following/friend lists) — that no existing command covers. The path was verified live in the explore phase on two profile types (numeric-ID and vanity-username) across all 7 tabs, with extraction anchors that rely only on stable ARIA roles / data-ad-preview / URL structure. Its output can be chained into `facebook/get-post` (post permalinks) and `facebook/search` (finding users). Requires browser runtime and an active Facebook login.
