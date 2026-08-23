# Context

## Precipitation Background (Why This Command Exists)

Vimeo's /watch page organizes content by editorial category blocks. Users browse them via the /categories directory (10 categories) and then the full list at /categories/{cat}/videos. The command was precipitated so a category's video listing (with title/url/duration/author/views/thumbnail) can be fetched on demand without re-exploring the SSR structure. It complements the existing `vimeo/search` command (search API in browser context) by covering the browse-by-category path, which runs on plain node.

## Value Assessment

- Public, stable SSR pages; no login, no API key, no browser — cheap and fast to reuse.
- Parametrized by 10 categories × 7 sorts × limit (1-100); each combination is a distinct useful query.
- Verifies/paginates internally, so callers get a flat list without handling pagination.
- Consistent card semantics with `vimeo/search`, so downstream consumers can treat both outputs uniformly.

## Page Structure

- Directory: `https://vimeo.com/categories` → anchors `a[href^="/categories/{slug}"]` (10 slugs).
- List URL: `https://vimeo.com/categories/{cat}/videos/page:{N}/sort:{sort}/format:detail`.
  - Path order is `/videos/page:N/sort:X/format:detail`; `page:` omitted for page 1.
  - `/format:detail` is REQUIRED: default thumbnail cards lack duration/author/views.
- Cards: `<li class="clearfix" id="clip_{id}">...</li>` inside `<ol class="js-browse_list ... browse_videos_details">`. Some `<li>` slots are placeholder cards (default thumbnail, no `<a>` link, e.g. `clip_103076330` on travel page 6) — skip cards without a video link.
- Field selectors (within a card):
  - title: `<p class="title">\s*<a href="/{id}">Title</a>` (whitespace/newlines after the tag).
  - url: first `href="/{id}"`.
  - duration: `<div class="duration">06:15</div>`.
  - author: `from <a href="/{authorSlug}">Name</a>` inside `<p class="meta">`.
  - views: `<span ... title="Views">3.5M</span>` (absent on some cards → null).
  - thumbnail: `img.thumbnail` `src` = `https://i.vimeocdn.com/video/...-d_150x84?region=us`.
  - addedDate: `<time datetime="...">` after "Added" (available but not in the output contract).
- Pagination: 18 cards/page; `link/a[rel="next"]` → next page; no lazy-load XHR; no total count in SSR.

## Environment Dependencies

- Node runtime only; uses global `fetch` and built-in `setTimeout`.
- Polite pacing: random sleep 200-700ms before every request; retries once on 429/503/504.
- Browser UA required (plain curl/node without UA may be served differently).
- api.vimeo.com anonymous endpoint returns 401 (error_code 8003) — do not switch to it.

## Failure Signals

- 404 with "VimeUhOh": unknown category slug, or wrong path order (`sort:X/page:N`).
- Transient 504 / slow 5-6s responses: retry once (observed once in 34+ calls; recovered on retry).
- Cloudflare challenge ("Just a moment", "challenge-platform"): challenge page; slow down and retry.
- Page with no `li[id^=clip_]` on page 1: if the `js-browse_list` container is still present it is a valid empty listing → empty result with partial; only a missing container raises `DRIFT_DETECTED`.
- Browser default page enriches cards to detail format client-side; the command must request `/format:detail` explicitly.

## Repair Clues

- If card extraction breaks, re-verify the `<li id="clip_">` and `<p class="title">` structures against a live `format:detail` page.
- `data-stream` base64 token on the `<ol>` decodes to `category|{id}|{sort}:{order}|[]` — a fallback stream identifier if Vimeo switches to JS-driven infinite scroll.
- Category slugs can be re-derived from `https://vimeo.com/categories`.
- Alternative data path (if SSR ever drops fields): video detail pages `vimeo.com/{id}` (oEmbed/`__NEXT_DATA__`), but that would raise cost per card; keep SSR as primary.
