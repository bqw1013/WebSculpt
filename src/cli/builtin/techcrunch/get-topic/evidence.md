# Evidence: techcrunch/get-topic

This document records the research and validation evidence for the `techcrunch/get-topic` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows one existing command `techcrunch/get-latest` (user source, node runtime, no browser, no login). No name conflict with `techcrunch/get-topic`.
- Source trace: verified in the explore stage (assess passed). Tag path verified there: `tags?slug=apple` → id=291, count=12550; `posts?tags=291` filters correctly.
- Contract consulted: the node runtime contract before drafting `command.js`.
- Re-verified live with curl + Playwright CLI on 2026-08-14 (not assumed from the plan): tag slug resolution, nonexistent-tag behavior, pagination headers, category name resolution, and tag-page vs API order consistency in a real browser session.

## Verified URLs

- https://techcrunch.com/wp-json/wp/v2/tags?slug=apple&_fields=id,name,slug,count
- https://techcrunch.com/wp-json/wp/v2/tags?slug=zzzzqqqqxxx&_fields=id,name,slug,count (nonexistent slug → empty array)
- https://techcrunch.com/wp-json/wp/v2/posts?tags=291&per_page=5&_fields=id,date,link,title
- https://techcrunch.com/wp-json/wp/v2/posts?tags=291&per_page=2&_fields=id,title,categories,link,date,jetpack_featured_media_url,excerpt
- https://techcrunch.com/wp-json/wp/v2/categories?include=21587494,577047203,577051039&per_page=50&_fields=id,name,slug
- https://techcrunch.com/tag/apple/ (browser-verified, compared DOM article list against API)

## Structural Evidence

- Endpoint pair for tag streams — public WordPress REST API, no auth, no browser required:
  1. `GET /wp-json/wp/v2/tags?slug={slug}&_fields=id,name,slug,count` resolves the tag slug to a numeric `id` and returns `name` (display label, e.g. "Apple") and `count` (total articles under the tag, e.g. apple → 12550).
  2. `GET /wp-json/wp/v2/posts?tags={id}&per_page={n}&page={p}&_fields=id,date,link,title,excerpt,jetpack_featured_media_url,categories` filters posts by that tag id.
  3. `GET /wp-json/wp/v2/categories?include={id1,id2,...}&per_page=50&_fields=id,name,slug` resolves the numeric `categories` ids on posts into `name`/`slug`. TechCrunch has only 25 categories total, so the include list is tiny and bounded.
- `per_page` cap is 100. Pagination is real: page 1 and page 2 with `per_page=100` return distinct posts.
- `X-WP-Total` header gives the total number of posts for the tag filter; `X-WP-TotalPages` = ceil(total/per_page). For `tags=291` the posts total was 12546, slightly less than the tag's `count` of 12550 — a source-level discrepancy (tag count includes a few posts not returned by the public posts endpoint, e.g. non-default status). The command surfaces `topic.articleCount` from the tags endpoint `count` (the canonical tag total).
- Post fields used for list cards:
  - `title.rendered` — HTML-encoded (e.g. `&#8217;` for apostrophes, `&#8211;` for en-dashes)
  - `excerpt.rendered` — wrapped in `<p>…</p>`, may contain `&#8230;` ellipsis, `&#8217;`
  - `link` — canonical post URL
  - `date` — ISO `YYYY-MM-DDTHH:MM:SS`
  - `jetpack_featured_media_url` — featured image URL (present for most posts, can be null)
  - `categories` — numeric category ids (e.g. `[21587494]`, `[577047203,577051039]`)
- Nonexistent tag slug: `tags?slug=zzzzqqqqxxx` → HTTP 200, empty array `[]`. Treated as NOT_FOUND (resource does not exist), distinct from "successful empty results".
- Tag page vs API order (browser-verified): navigating `https://techcrunch.com/tag/apple/` in a real Chrome session, the first 5 article cards in the DOM matched the first 5 posts from `posts?tags=291&per_page=5` exactly (same titles, same order). The tag page is newest-first and the API is authoritative for that order.
- `_embed=1` is not used: it inflates each post to ~1.3 MB; the two-request approach (posts + categories batch) is the validated minimal path.

## Failure Signals

- `tags?slug={slug}` returning HTTP 200 + empty array → the tag does not exist → `NOT_FOUND` (no page/API 404, but semantically the requested resource is absent).
- HTTP 200 + non-array body → `DRIFT_DETECTED` (API shape changed).
- Non-2xx from any API call → `API_ERROR` with status code.
- Network failure / timeout → `NETWORK_ERROR`.
- Missing/empty `topic` → `MISSING_PARAM` before any request.
- Invalid `limit` (NaN, <1, >100) → `INVALID_PARAM` before any request (no silent clamping; validation is up-front per design guidelines).
- A tag that resolves but whose post stream is empty is not expected (tags with 0 posts would not be the verified path); if it happens it is treated as an empty legitimate result, not an error.
- Polite pacing: the API is public and stable; still, the command sleeps a random 200–700ms before each request and runs pages serially to keep cadence moderate (8 techcrunch commands may hit the same host concurrently). No browser involvement, so no CAPTCHA/login-wall risk observed.
- Tag `count` vs posts `X-WP-Total` may differ by a handful (observed 12550 vs 12546) — source behavior, not a command bug.

## Capture Assessment

Captured as `techcrunch/get-topic`: it is the entry point for following a specific company/person/product tag (apple, openai, cloud-computing, ...) on TechCrunch, which the existing `get-latest` (editorial categories only) cannot do. Reuses the same verified public WordPress REST API channel as the other techcrunch commands, adding the slug→id resolution step. Node runtime, no auth, no browser. Output is `{ topic: {slug, name, articleCount}, articles: Array<{title, url, date, excerpt, image, categories: string[]}>, partial? }`, matching the approved contract. Proceed to capture.
