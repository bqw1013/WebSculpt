# Context

## Precipitation Background (Why This Command Exists)

TechCrunch commands previously covered only editorial categories (`get-latest`, later renamed `get-feed` — the 23 fixed nav sections). That cannot answer "everything TechCrunch has written about this company/product/person". TechCrunch's tag system (apple, openai, spacex, cloud-computing, … — tens of thousands) is the right entry point for topic monitoring; the site nav items Apple / Amazon / Cloud Computing are actually tag pages. `get-topic` was precipitated to cover that gap. Part of an 8-command TechCrunch family being captured in parallel (search, get-feed, get-article, get-topic, get-author, get-popular, list-events, list-podcast-episodes).

## Value Assessment

- High reuse: topic/company monitoring is a common ask ("what's TechCrunch saying about X lately?").
- Each call replaces a manual visit to `techcrunch.com/tag/{slug}/` plus pagination.
- Shares the same public WordPress REST API channel as the rest of the family, so it is cheap, fast, and stable.

## Page Structure

- API path (no browser needed):
  1. `GET /wp-json/wp/v2/tags?slug={slug}&_fields=id,name,slug,count` → resolves slug to numeric `id`, gives `name` (e.g. "Apple") and `count` (total articles).
  2. `GET /wp-json/wp/v2/posts?tags={id}&per_page=100&page={n}&_fields=id,date,link,title,excerpt,jetpack_featured_media_url,categories` → newest-first posts under the tag.
  3. `GET /wp-json/wp/v2/categories?include={ids}&per_page=50&_fields=id,name,slug` → resolves the numeric `categories` ids to display names.
- Browser page for reference: `https://techcrunch.com/tag/{slug}/` (server-rendered cards, newest first; classic pagination `/tag/{slug}/page/2/`). Browser-verified 2026-08-14: the first 5 DOM cards match `posts?tags=291` exactly in order.

## Environment Dependencies

- Public API: no login, no browser, no API key.
- Polite pacing: the command sleeps a random 200–700ms before each request and runs pages serially. 8 techcrunch commands may run concurrently against the same host, so cadence matters; do not raise concurrency or remove the sleeps.
- `per_page` cap is 100; `limit` is capped at 100, so the pagination loop usually runs a single page. The loop is still paginated for robustness.

## Failure Signals

- `tags?slug={slug}` → HTTP 200 + `[]`: the tag does not exist → `NOT_FOUND`.
- HTTP 200 + non-array body on any endpoint → `DRIFT_DETECTED` (structure changed).
- Non-2xx → `API_ERROR` (429 mapped to `RATE_LIMITED`).
- Network failure/timeout → `NETWORK_ERROR`.
- If WordPress changes the tag resolution endpoint or the post card fields, re-verify with the URLs above.

## Repair Clues

- Alternative entry point: the tag page HTML `https://techcrunch.com/tag/{slug}/` is server-rendered and paginated (`/tag/{slug}/page/2/`) — usable as a fallback if the REST API is ever gated. Card links live in anchors to `/2026/...` article URLs; titles are the anchor text.
- Known source nuance: tag `count` (e.g. 12550 for apple) can exceed the posts endpoint total (`X-WP-Total` was 12546) by a few — the tag counts a few posts not returned by the public posts endpoint. `topic.articleCount` intentionally reports the canonical tag count; do not "fix" this to match `X-WP-Total`.
- Installed command is a copy of this draft. Fix by editing the draft here and re-running `websculpt capture finalize techcrunch-get-topic --force`.
