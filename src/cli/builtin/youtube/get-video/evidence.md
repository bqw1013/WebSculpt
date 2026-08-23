# Evidence: youtube/get-video

This document records the research and validation evidence for the `youtube/get-video` command.

## Exploration Path

- Command library check (`websculpt command list youtube`): existing commands are `youtube/get-feed` (homepage feed) and `youtube/search` (search result cards). Neither returns full single-video metadata (full description, category, like count) or comments. This is a **new** command, complementary to the existing ones.
- Browser runtime guide and capture browser contract consulted before implementation.
- Explored with Playwright CLI (`@playwright/cli`) attaching to the user's Chrome session `<session>`. All selectors and JSON paths below were verified live on real pages.
- URL normalization verified: `/watch?v={id}`, `/shorts/{id}`, `youtu.be/{id}`, and a bare 11-char videoId all resolve to the same `/watch?v={id}` page.

## Verified URLs

- https://www.youtube.com/watch?v=dQw4w9WgXcQ (metadata + comment thread fully verified)
- https://www.youtube.com/shorts/dQw4w9WgXcQ (redirects to /watch?v=dQw4w9WgXcQ)
- https://youtu.be/dQw4w9WgXcQ (redirects to /watch?v=dQw4w9WgXcQ)
- https://www.youtube.com/watch?v=sQK70SY-Ds0 (public video with comments)
- https://www.youtube.com/watch?v=aDbATxaLLco (public Short)
- https://www.youtube.com/@ExampleChannel/videos (channel videos page, used for discovery)

## Structural Evidence

### Page data (window.ytInitialPlayerResponse)

- `videoDetails`: `videoId` (string), `title`, `author`, `channelId`, `viewCount` (raw number string, e.g. `"26273"`), `lengthSeconds` (string, e.g. `"1543"`), `isLiveContent` (bool), `shortDescription` (full description text with newlines), `keywords` (array).
- `microformat.playerMicroformatRenderer`: `publishDate` (ISO string, e.g. `"2026-08-12T17:00:14-07:00"`), `uploadDate`, `category` (e.g. `"Music"`, `"News & Politics"`), `externalChannelId`, `ownerChannelName`. `title`/`description` are `{simpleText}` or runs-array objects; normalize with `Array.isArray(x) ? x.map(r=>r.text).join('') : x.simpleText || x`.

### Video page DOM

- Like count: `#top-level-buttons-computed button[aria-pressed]` → `aria-label` is localized, e.g. `与另外 1,323 人一起顶此视频` (English: `1,323 likes`). Parse number with `/([0-9][0-9,]*)\.?/` → strip commas → `1323`. If no numeric match, like count is 0.
- Channel link: `ytd-channel-name a` → `href`. May be `/@ExampleChannel` (handle present) or `/channel/UC...` (legacy, no handle → handle=null).
- Subscriber count: `#owner-sub-count` (a.k.a `#owner #subscriber-count`) → localized text, e.g. `130万位订阅者`.
- Description expander: `#description-inline-expander`, expand button `#expand`, collapse button `#collapse`. Full description is taken from `videoDetails.shortDescription` so no expand interaction is needed.

### Comments

- Section: `ytd-comments#comments`. Initially only the header exists; `scrollIntoView()` on the section (or scrolling the page) triggers the first batch of ~20 `ytd-comment-thread-renderer`.
- Header: `#header` text, e.g. `2,453,660 条评论 排序方式 添加评论…` (total comment count).
- Thread renderer fields: `ytd-comment-thread-renderer` → `ytd-comment-view-model#comment`:
  - author: `#author-text` (text starts with `@`, href `/@handle`)
  - text: `#content-text`
  - likes: `#vote-count-middle` (localized, e.g. `30万`, `3298`)
  - publishedAt: `#published-time-text` (localized relative time, e.g. `1年前`, `5分钟前`, `1天前`)
  - replyCount: from replies toggle `button[aria-label*="条回复"]` → parse leading integer (e.g. `963 条回复` → 963); absent when no replies → 0.
- Reply expansion: click the visible replies toggle (the `button[aria-label*="条回复"]` whose `offsetParent !== null`); the reply items use the same field selectors as top-level comments, with `#more-replies` for pagination.
- Continuation: scrolling to the bottom of the comments loads the next batch (~+20). `#continuations` / `ytd-continuation-item-renderer` appear in the section. When the stream is exhausted, no more batches load → `partial=true`.
- Sort menu: header `#sort-menu tp-yt-paper-button` (aria-label `评论排序`, text `排序方式`). Clicking it opens `[role=option]` items: `最热门` (Top, "显示精选评论") and `最新` (Newest, "显示近期评论"). Selecting `最新` reloads the thread with newest first (verified: first comments became `5分钟前`). Pinned comments remain pinned at the top even under newest sort.
- Important: the URL parameter `?comment_sort=newest` is stripped by YouTube on navigation (redirect back to `/watch?v={id}`) — **sort must be implemented via the UI menu click**, not the URL param.

### URL normalization

- Extract a bare 11-char videoId (`[A-Za-z0-9_-]{11}`) from any of the four accepted forms and navigate to `https://www.youtube.com/watch?v={videoId}`. `/shorts/{id}` and `youtu.be/{id}` redirect there anyway; real Shorts (lengthSeconds < 60) render correctly on the `/watch` page.

## Failure Signals

- `window.ytInitialPlayerResponse` missing on the watch page → video unavailable, region-blocked, or requires sign-in. Should error with a distinct code rather than returning empty metadata.
- `#top-level-buttons-computed` like button absent or aria-label has no numeric match → like count 0 (do not crash).
- `ytd-comments#comments` absent or header shows only `评论` with no threads even after scrolling → comments disabled/empty; return `comments: []` and `partial: false`.
- Comment count in header could not be parsed → still proceed with the loaded threads.
- Sorting: do not rely on `?comment_sort=` URL param (stripped). Use the UI menu. Under `newest`, pinned comments may appear first — this is YouTube behavior, not a bug.
- Polite pacing: randomize scroll steps and mouse movement, add small random delays between interactions, keep the total operation frequency low to avoid YouTube rate-limiting.
- **Background-tab throttling (verified root cause)**: if the daemon's page is a background tab, Chrome throttles the IntersectionObserver and YouTube's lazy comment loading stalls (first batch drops to ~4 threads and continuation stalls). Fix: call `page.bringToFront()` after `goto`. With it, the first batch loads 20 reliably.
- **Comment continuation (verified)**: scroll-triggered continuation is flaky in the daemon. The reliable mechanism is calling the top-level `ytd-continuation-item-renderer.triggerContinuation()` method (the element not inside a `yt-sub-thread`). Verified on probe: 20→40→54 cleanly; in the daemon 20→40 with limit 40, partial=false. Comments are NOT embedded in `ytInitialData` — the first batch and continuation are loaded lazily by the client via `POST /youtubei/v1/next`.

## Capture Assessment

Confirmed candidate: `youtube/get-video`. Runtime `browser` (needs the daemon CDP attach to the user's Chrome; public content needs no login). Parameters: `url` (required, four input forms), `include_comments` (bool, default false), `comment_limit` (1-100, default 20, top-level comment cap), `comment_sort` (enum `top`|`newest`, default `top`). Output: `{ video: {videoId, title, url, channel{name,handle,channelId,url,subscribers}, views, likes, publishDate, duration, category, description, isLive}, comments?: [{author,text,likes,publishedAt,replyCount}], partial }`. Capturing is worthwhile because single-video detail + comments is a recurring need not covered by existing youtube commands.
