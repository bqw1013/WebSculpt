# Context

## Precipitation Background (Why This Command Exists)

The Facebook command library previously covered search, the home feed, individual posts, and groups, but had no way to read a specific personal profile's timeline and sub-pages. `facebook/get-profile` was planned (the command-family plan section 3) to fill this gap: given a numeric user ID or username, fetch the profile's mixed post timeline (全部), structured bio (简介), photos, reels, and follower/following/friend lists. It complements `facebook/get-page` (public pages, path-based sub-URLs) and chains into `facebook/get-post` via post permalinks.

## Value Assessment

Reading a Facebook profile is a common task (checking someone's posts, bio, photos, or connection lists). The command saves the user from manually navigating through the profile tabs and scrolling. It handles both URL forms (numeric ID and username), all 7 tabs, internal scrolling to `limit`, and honest `partial=true` semantics. Its output can be fed to `facebook/get-post` for full post text and comments.

## Page Structure

- Profile base URL: `https://www.facebook.com/profile.php?id={id}` (numeric ID) or `https://www.facebook.com/{username}`. `?sk=` works on both forms.
- Tabs via sk: all (no sk) / about (sk=about) / photos (sk=photos) / reels (sk=reels_tab) / followers (sk=followers) / following (sk=following) / friends (sk=friends).
- `all` tab: posts are top-level `div[role="article"]` (no `div[role="feed"]` container on profiles, unlike the home feed). Nested `div[role="article"]` elements are comments inside a post and must be filtered out.
- Post fields: author link (single-segment vanity or `profile.php?id=`), `[data-ad-preview="message"]` text, permalink regex, `[role="button"]` numeric stats, `a[href*="/photo/"] img` photo, `video[poster]` video.
- About: the about page has a sub-nav tablist of `role="tab"` links to directory sub-pages (`?sk=directory_*` for numeric-ID profiles, `/directory_*` for vanity profiles). Section content is the container sibling after the sub-nav tablist. Public-figure profiles expose category + bio; regular users expose location/work/education.
- Connections (followers/following/friends): the page has an internal tab list (粉丝/已关注). Entity cards each carry a short action button and a name link to `profile.php?id=` or a single-segment vanity URL.

## Environment Dependencies

- Browser runtime; requires the user's Chrome/Edge with remote debugging enabled and an active Facebook login.
- Facebook is GraphQL + obfuscated class names: only ARIA roles, `data-ad-preview`, and URL path structure are stable anchors. No class names are used.
- Polite pacing: Facebook is strict. The command scrolls naturally (mouse move + wheel + random waits), keeps page loads reasonable, and does not hammer the site. During exploration ~15 navigations caused no checkpoint/freeze/CAPTCHA.
- UI language: the session UI may be in Chinese; extractors avoid depending on localized text where possible, but empty-state detection and follow-button anchors reference both Chinese and English variants.

## Failure Signals

- Login wall ("Log into Facebook"/"登录 Facebook") -> AUTH_REQUIRED.
- Account check / block ("temporarily locked"/"checkpoint"/"确认你的身份") -> ACCESS_BLOCKED.
- Not found / inaccessible ("此内容目前无法显示"/"isn't available right now"/"the link you followed may be broken") -> NOT_FOUND.
- Missing `div[role="main"]` -> DRIFT_DETECTED.
- Empty lists (friends empty state, 0-follower accounts) -> empty array with `partial: true`.

## Repair Clues

- If posts stop extracting: the profile timeline may have gained a `div[role="feed"]` wrapper (like the home feed). The extractor should then look inside `div[role="feed"]` as well as top-level articles.
- If connections extraction returns header noise: tighten the `isEntityLink` exclusion list or scope the scan to after `[data-pagelet="ProfileTabs"]`.
- If `?sk=` stops working on a vanity profile: the profile may have switched to path-based sub-URLs (`/{username}/about`). The `tabUrl` helper would need a fallback to path forms.
- If about directory URLs change: re-discover the sub-nav tablist hrefs; they are read dynamically at runtime, so a label/href change only affects the `dirLinks` keyword mapping.
- Test fallbacks: LHL (leehsienloong) for public-figure about + rich posts; a private/empty profile for the empty/private cases.
