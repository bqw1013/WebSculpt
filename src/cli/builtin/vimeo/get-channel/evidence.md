# Evidence: vimeo/get-channel

This document records the research and validation evidence for the `vimeo/get-channel` command.

## Exploration Path

- Explored in workspace `<explore-workspace>`, audit passed (assess passed, capture eligible).
- Runtime determined as `node`: the channel list page `/channels/{name}/videos` is legacy server-side rendered HTML (no `__NEXT_DATA__`, no lazy-load XHR); anonymous `api.vimeo.com/channels/*` returns HTTP 401 (error_code 8003, needs OAuth token) so HTML is the only data path.
- Rate-limit probing (node direct, Chrome UA): 8 consecutive calls with 200-700ms random sleep all returned 200; a further 5-call no-sleep burst all returned 200. No 429/403/Cloudflare challenge/JS shell/degradation observed.
- Browser cross-check via Playwright CLI attach (`<session>`): for the same URL, browser DOM and node HTML were field-identical (12 cards, first-card id/title/duration/author/views/thumbnail all equal).
- Existing command library overlap: only `vimeo/search` in the same domain; it is keyword search (browser runtime, page-token API) and does not cover channel listing.

## Verified URLs

- https://vimeo.com/channels/staffpicks/videos/sort:preset/format:detail — flagship channel, rich-card list page (12 cards/page, header + sidebar channel info)
- https://vimeo.com/channels/staffpicks/videos/page:2/sort:preset/format:detail — pagination page 2
- https://vimeo.com/channels/staffpicks/videos/page:1340/sort:preset/format:detail — last-page boundary (5 clips, no next link)
- https://vimeo.com/channels/staffpicks/videos/sort:date/format:detail — date sort
- https://vimeo.com/channels/staffpicks/videos/sort:alphabetical/format:detail — alphabetical sort (first card differs)
- https://vimeo.com/channels/staffpicks/videos/sort:plays/format:detail — plays sort (first card 22439234 "The Mountain")
- https://vimeo.com/channels/staffpicks/videos/sort:likes/format:detail — likes sort
- https://vimeo.com/channels/staffpicks/videos/sort:duration/format:detail — duration sort
- https://vimeo.com/channels/premieres/videos/sort:date/format:detail — sub-channel (Staff Pick Premieres)
- https://vimeo.com/channels/bestofstaffpicks/videos/sort:date/format:detail — sub-channel (Best of Vimeo Staff Picks)
- https://vimeo.com/channels/thedecade/videos/sort:date/format:detail — sub-channel (A Decade of Staff Picks)
- https://vimeo.com/channels/music/videos/sort:date/format:detail — user-created channel (same structure)
- https://vimeo.com/channels/bestoftheyear/videos/sort:date/format:detail — HTTP 404 (channel retired; "Best of the Year" moved to top-level /bestoftheyear)
- https://vimeo.com/channels/staffpicks/videos/rss — RSS feed (10 items, no pagination/sort; supplemental only)
- https://api.vimeo.com/channels/staffpicks/videos?per_page=2 — HTTP 401 anonymous (not usable)

## Structural Evidence

- Pagination is path-based and still works: `/channels/{channel}/videos/page:N/sort:X/format:Y`. Head `<link rel="next" href="/channels/{channel}/videos/page:N+1">`; canonical `https://vimeo.com/channels/{channel}/videos/sort:X/format:Y`. Last page has no `rel="next"`.
- Items per page: 12 rich cards (`<li id="clip_{id}">` count verified on pages 1 and 2).
- Sort values verified on the sort bar: preset (default, curator order), date, alphabetical, plays, likes, duration. All six return different first cards (except preset/date happen to share the newest item right now).
- Format dimension: default `format:thumbnail` cards carry only title + thumbnail + added-time (no author/views); `format:detail` cards carry the full fields below. The command MUST always request `format:detail` and keep it in internal pagination URLs.
- Channel info (all on the /videos list page):
  - name/url: `<header id="page_header"><h1><a href="/channels/{channel}">Name</a> <span class="sub">/ Videos</span></h1></header>`
  - description: `<meta name="description" content="...">`
  - stats: sidebar `<p class="super_link_list_title">` values — [0]=Videos count ("16.1K Videos"), [1]=Followers ("1.4M Followers"), [2]=Moderators ("7 Moderators")
  - owner: `&ldquo;...&rdquo; by <a href="/{ownerSlug}">Owner Name</a> has <em>N videos</em>.`
  - channelId: Follow button `data-subject-id="927"`
- Video card (format:detail), per `<li id="clip_{id}">`:
  - id from `id="clip_{id}"`
  - title/url: `<p class="title"><a href="/channels/{channel}/{id}">Title</a></p>` (channel-context URL)
  - canonicalUrl: `<a href="/{id}" class="more">+ More details</a>`
  - duration: `<div class="duration">05:54</div>` (mm:ss formatted text)
  - author: `from <a href="/{userSlug}">Name</a>` (user slug, not /user/{id})
  - addedAt: `<time datetime="2026-08-17T09:55:00-04:00">`
  - views/likes/comments: `<span class="icon viconify_play_b" title="Views">13.5K</span>` etc. — OPTIONAL (3 of 12 cards on page 1 had no detail_icons block; must be null when absent)
  - thumbnail: `<img src="https://i.vimeocdn.com/video/{hash}-d_150x84?region=us">`
  - description: `<p class="description">...` (contains HTML entities, may be truncated by Vimeo)

## Failure Signals

- HTTP 404 for retired/unknown channel slugs (e.g. `bestoftheyear`), page title "Page Not Found" -> treat as NOT_FOUND.
- No `rel="next"` link on the last page -> stop pagination.
- Empty clip list on page 1 -> EMPTY_RESULT (channel exists with no videos).
- Missing `#page_header h1` or zero `id="clip_*"` elements -> DRIFT_DETECTED (structure changed).
- Channel names/titles/descriptions contain HTML entities (`&amp;`, `&hellip;`, `&eacute;`, `&ldquo;` etc.) that must be decoded; double-encoded `&amp;amp;` occurs, so decoding should run twice.

## Capture Assessment

The path is stable, public, and fully verified: SSR HTML list pages, path-based pagination, six sorts, and rich detail cards. Node runtime is justified (no rate limiting across 13 consecutive calls, browser-equal content, no API token dependency). Should be captured as `vimeo/get-channel`.
