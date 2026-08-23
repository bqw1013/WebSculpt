# Evidence: techcrunch/get-feed

This document records the research and validation evidence for the `techcrunch/get-feed` command.

## Exploration Path

- Command library check: `websculpt command list techcrunch` shows only `techcrunch/get-latest` exists in the `techcrunch` domain. `techcrunch/get-feed` is a rename/migration of `get-latest` (no name conflict).
- Exploration workspace: an exploration workspace (audit passed). The exploration was confirmed complete and `exploreVerified` is satisfied for this capture.
- Path validated live via a Playwright CLI attach (user Chrome) and raw `curl` from the local machine: HTTP 200, full JSON, no login, no UA/Referer validation.
- Runtime contract consulted before drafting `command.js`.
- This command reuses the verified `CATEGORY_MAP` (23 editorial category slug -> WordPress ID) from the installed `techcrunch/get-latest` command, cross-checked against the live `/wp/v2/categories` endpoint.

## Verified URLs

- https://techcrunch.com/wp-json/wp/v2/posts (core feed API; GET, public, no auth)
- https://techcrunch.com/wp-json/wp/v2/categories (category enumeration, 25 entries)
- https://techcrunch.com/latest/ and https://techcrunch.com/latest/page/2/ (Latest page + page 2; API order matches both)
- https://techcrunch.com/category/artificial-intelligence/ (AI category page; API order matches)
- https://techcrunch.com/category/startups/ (Startups category page; API order matches, including interleaved podcast/video)

## Structural Evidence

Feed API: `GET https://techcrunch.com/wp-json/wp/v2/posts`
- Public, no authentication, no browser required. Raw local `curl` returns HTTP 200 with full JSON.
- `per_page` max 100 (verified: `per_page=100` returns 100 items). Full-stream total `X-WP-Total: 261766`, `X-WP-TotalPages: 2618`.
- `page` beyond the last page returns HTTP 400 (stream exhaustion signal; the body is a WP error JSON).
- A valid category with no posts returns HTTP 200 with an empty array `[]` (not an error).
- `_fields` minimization verified: `id,date,link,title,excerpt,jetpack_featured_media_url,categories` returns only the requested fields on every post.
- Post `type` field: the API returns a mix of `post`, `tc_podcast`, and `tc_video` for category-filtered feeds (verified: 87/8/5 out of 100 for startups). The `/latest/` main feed returns only `post` type in the first 500 items. The `type=` query param is IGNORED by the API (verified: `type=tc_podcast` still returns `post` items), so the command cannot filter by post type.
- Ordering consistency verified end-to-end:
  - `/latest/` HTML top 10 == API `posts?per_page=10` top 10 (same 10 links, same order).
  - `/latest/page/2/` HTML first 8 == API `posts?per_page=20&page=2` first 8.
  - `/category/artificial-intelligence/` HTML top 10 == API `posts?categories=577047203&per_page=10` top 10.
  - `/category/startups/` HTML first 8 == API `posts?categories=20429&per_page=8` first 8 (including interleaved `/podcast/` and `/video/` links, which ARE rendered on the category page).

Category filter: `categories={id}` (id from `CATEGORY_MAP`). The 23 slugs and IDs were re-verified against live `/wp/v2/categories` (25 entries: 23 editorial + `ben-test-2` test residue + `tc` meta category). All 23 IDs in the existing `CATEGORY_MAP` match the live endpoint.

Post card fields (all verified on `post`, `tc_podcast`, and `tc_video` types):
- `id` (number)
- `title.rendered` (HTML; strip tags)
- `link` (canonical URL)
- `date` (ISO string, e.g. `2026-08-13T15:12:40`)
- `excerpt.rendered` (HTML; strip tags)
- `jetpack_featured_media_url` (featured image URL; present for podcast/video posts too)
- `categories` (array of WordPress category IDs; may include `17396` = `tc` meta category which is NOT an editorial section)

## Failure Signals

- No CAPTCHA / 403 / 429 observed across browser and curl requests (single and repeated calls).
- No login required; no UA/Referer validation (raw curl succeeds).
- Stream exhaustion: `page` beyond total returns HTTP 400. The command must treat a 400 on any page as "stream exhausted" and set `partial: true` (not an error). A page returning fewer than the requested `per_page` items is the same signal.
- `type=` param is silently ignored by the API; do not rely on it.
- Empty result (category with no posts, or feed ran out) is a valid HTTP 200 `[]`; the command should return `partial: true` rather than throwing.
- Polite pacing: a randomized 200-700 ms delay before each request to stay unobtrusive.
- If the API starts returning non-2xx for a normal request, treat as `API_ERROR`.

## Capture Assessment

The path is fully validated end-to-end (browser + raw curl). It is stable, public, parameterizable by `category` (23 fixed editorial sections) and `limit` (1-100, internal pagination), and covers the core TechCrunch consumption need (the chronological feed behind `/latest/` and all category pages). The existing `get-latest` command is a strict subset of this design (same API, same category map, but `per_page`/`page` instead of `limit` + `partial`). This should be captured as `techcrunch/get-feed` and the installed `get-latest` should be renamed/replaced (see final report for disposition).
