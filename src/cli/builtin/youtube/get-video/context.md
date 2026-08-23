# Context

## Precipitation Background (Why This Command Exists)

Existing `youtube/search` and `youtube/get-feed` return video cards only — no full single-video metadata (full description, category, like count) and no comments. This command fills that gap: one video's complete metadata plus an optional top-level comment thread. Comments were folded into this command (not a separate command) per the design plan.

## Value Assessment

High reuse: video detail lookup is a recurring need; downstream commands (channel-info, download) accept the videoId/url this command returns. Saves repeated manual browsing of the watch page.

## Page Structure

- Watch page: `https://www.youtube.com/watch?v={videoId}` — built after extracting the 11-char ID from any accepted URL form (`watch?v=`, `/shorts/`, `youtu.be/`, bare ID). `/shorts/{id}` and `youtu.be/{id}` redirect there anyway.
- Metadata: `window.ytInitialPlayerResponse.videoDetails` (videoId/title/author/channelId/viewCount/lengthSeconds/isLiveContent/shortDescription) + `microformat.playerMicroformatRenderer` (publishDate/category). `microformat.title/description` are `{simpleText}` or runs-array objects — normalize with `textOf`.
- Like count: `#top-level-buttons-computed button[aria-pressed]` — pick the button whose aria-label contains `顶此视频` (Chinese) or `like` without `dislike` (English); parse the number with `/[\d,]+/`.
- Channel: `ytd-channel-name a` href (`/@handle` or `/channel/UC...`); `#owner-sub-count` for subscribers.
- Comments: `ytd-comments#comments`; `scrollIntoView()` loads the first ~20 `ytd-comment-thread-renderer`; scrolling to the bottom loads the next batch. Thread fields: `#author-text`, `#content-text`, `#vote-count-middle`, `#published-time-text`, replies toggle `button[aria-label*="条回复"]`.
- Sort menu: `#sort-menu tp-yt-paper-button`; options `[role=option]` — `最热门` (top) / `最新` (newest).

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled (daemon CDP attach). Public content needs no login.
- Polite pacing: the command adds random delays (`waitRandom`) and a random mouse move between interactions, and randomizes scroll steps to keep operation frequency low.
- Comment loading is slow by nature (scroll + continuation). Keep `comment_limit` modest by default.

## Failure Signals

- `window.ytInitialPlayerResponse` missing → if body text shows `不可用`/`unavailable` → `NOT_FOUND`; otherwise `DRIFT_DETECTED`.
- Like button absent or no numeric aria-label → `likes: 0`.
- `ytd-comments#comments` absent, or no threads ever load after scrolling → `comments: []`; `partial: false`.
- Pinned comments stay pinned at the top even under `newest` sort — YouTube behavior, not a bug.
- **Do not** rely on the `?comment_sort=` URL param — YouTube strips it on navigation (verified); sort must go through the UI menu click.

## Repair Clues

- If the comment thread field selectors drift, re-verify against `ytd-comment-view-model#comment` children (`#author-text`, `#content-text`, `#vote-count-middle`, `#published-time-text`).
- If `#top-level-buttons-computed` changes, fall back to scanning buttons with `aria-pressed` whose label matches like semantics.
- If the sort menu text changes locale, the "最新" option match may need a broader prefix match; consider matching by the description hint (`显示近期评论`).
- **If comment loading returns only ~4 threads or stalls**, the daemon page is likely a throttled background tab — ensure `page.bringToFront()` is called after `goto`. The IntersectionObserver that triggers YouTube's lazy comment load does not fire reliably in background tabs.
- **If continuation stops at ~20**, do not add scroll-based loading; instead call the top-level `ytd-continuation-item-renderer.triggerContinuation()` (the element NOT inside `yt-sub-thread`). Scroll/wheel-triggered continuation is unreliable in the daemon.
- Comments are lazily loaded (not in `ytInitialData`); do not try to parse the first page or continuation token from `ytInitialData` on the watch page.
- Explore evidence lives in a prior explore workspace; re-run the explore path to re-verify any selector.
