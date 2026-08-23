# Evidence: vimeo/get-category

This document records the research and validation evidence for the `vimeo/get-category` command.

## Exploration Path

- Command library check: `websculpt command domains` / `websculpt command list vimeo` — only `vimeo/search` exists; `get-category` is a new candidate. No conflict.
- Explore workspace: `<explore-workspace>` (assess passed 2026-08-18).
- Data path chosen after runtime testing: **node** direct SSR fetch (no browser, no API key). The original plan suggested a browser runtime, but node satisfies both hard criteria (no rate limit over 34+ consecutive calls; info content equal to browser rendering — verified by Playwright CLI comparison).
- No browser automation guide consultation needed (node runtime; no browser automation in the final command).

## Verified URLs

- https://vimeo.com/categories — directory page listing all 10 category slugs (HTTP 200).
- https://vimeo.com/categories/documentary/videos/sort:featured/format:detail — category list page, 18 cards/page (HTTP 200).
- https://vimeo.com/categories/documentary/videos/page:2/sort:featured/format:detail — path-based pagination page 2 (HTTP 200, 18 cards).
- https://vimeo.com/categories/documentary/videos/sort:relevant/date/alphabetical/plays/likes/duration/format:detail — all 7 sorts verified (HTTP 200, ordering changes).
- https://vimeo.com/categories/animation/videos/sort:featured/format:detail — isomorphism spot-check (HTTP 200, 18 cards).
- https://api.vimeo.com/categories/documentary/videos?per_page=5 — HTTP 401 (error_code 8003), anonymous API not available; not needed for the command.

## Structural Evidence

- Category directory `/categories`: anchors `a[href^="/categories/{slug}"]`. Verified slugs (10): animation, adsandcommercials, brandedcontent, comedy, documentary, experimental, music, narrative, sports, travel.
- Category list page URL shape: `https://vimeo.com/categories/{cat}/videos/page:{N}/sort:{sort}/format:detail`. Path order: `/videos/page:{N}/sort:{sort}/format:detail`. `page:` is optional (defaults to 1); `format:detail` is REQUIRED to get full card fields (default thumbnail cards lack duration/author/views).
- Card container: `<ol class="js-browse_list ... browse_videos_details">`; each card is `<li class="clearfix" id="clip_{id}" data-start-page="..." data-position="N">...</li>`.
- Placeholder cards: a page renders 18 `<li>` slots, but some slots are placeholders with a default thumbnail (`https://secure-b.vimeocdn.com/thumbnails/defaults/default.84x150.jpg`) and **no `<a>` video link** (removed/private videos still listed). Example: `clip_103076330` on travel page 6. The command skips cards without a video link.
- Card fields (all inside the `<li>`, verified on `format:detail`):
  - id: `li#clip_{id}` (e.g. `clip_8191217`).
  - title: `<p class="title">\n <a href="/{id}">{title}</a>\n </p>`.
  - url: `https://vimeo.com/{id}` from `a[href^="/{id}"]`.
  - duration: `<div class="duration">06:15</div>`.
  - author: `from <a href="/{authorSlug}">{authorName}</a>` inside `<p class="meta">`.
  - views: `<span class="icon viconify_play_b" title="Views">3.5M</span>`; 4 of 18 cards have no Views element (views is nullable).
  - thumbnail: `img.thumbnail` `src` = `https://i.vimeocdn.com/video/...-d_150x84?region=us`; `srcset` has the 2x `d_300x168`.
  - addedDate: `<time datetime="2009-12-15T03:41:56-05:00">` after "Added".
- Pagination: per page 18 card slots. `link[rel="next"]` points to `/categories/{cat}/videos/page:{N+1}`; `link[rel="prev"]` to previous. Deep pages keep returning distinct content (documentary page 100 distinct from page 1). No lazy-load XHR; no total count in SSR.
- Exhaustion (partial) trigger: a page yields 0 real cards, or `link[rel="next"]` is absent, or no new video IDs vs earlier pages. All 10 categories are large (>=14 pages each), so partial rarely fires for limit<=100.
- Sorts verified (7): featured (default), relevant (same order as featured), date, alphabetical, plays, likes, duration. Sort order genuinely changes video order.
- Page is pure SSR: no `__NEXT_DATA__`, no `api.vimeo.com` dependency for card data (the 2 `api.vimeo.com` string refs are a dev-logging fetch hook and a config string).

## Failure Signals

- HTTP 429/403/Cloudflare challenge: NOT observed over 34+ consecutive node calls (8 back-to-back same URL, 14 simulated command run, 12 cross-category mix). One transient 504 (music/sort:plays, ~35s) retried to 200 — treat as transient server hiccup; retry once.
- Slow responses: occasional 5-6s (vs typical 770-1400ms); add random sleep 200-700ms between calls to keep a polite pacing profile.
- 404 `VimeUhOh`: seen when URL path order is wrong (`sort:X/page:N` instead of `page:N/sort:X`); also real 404 for unknown category slug.
- Partial/exhaustion: a page yields <18 cards, or `link[rel="next"]` is absent, or no new IDs vs earlier pages → listing exhausted.
- api.vimeo.com anonymous endpoint returns 401 (error_code 8003) — do not rely on it.
- Browser-rendered default category page enriches cards to detail format client-side; node must request `/format:detail` explicitly to match.

## Capture Assessment

This command should be captured. The path is verified, stable, public (no login), and reusable: given a category slug, sort, and limit, it returns the video-card listing with title/url/duration/author/views/thumbnail. Node runtime is chosen over the plan's browser suggestion because (1) no rate limiting over 34+ consecutive calls, and (2) node `format:detail` SSR content is byte-for-byte equal to the browser-rendered cards (verified by Playwright CLI: same ids/titles/durations/authors/views/thumbnails, and identical sort:plays first-5 ordering). Capturing saves repeated exploration and is consistent with the existing `vimeo/search` command family.
