# Evidence: techcrunch/get-popular

This document records the research and validation evidence for the `techcrunch/get-popular` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

- Command library overlap: `techcrunch/get-latest` exists (WP REST API based); no existing `get-popular` command and no name conflict (`capture new` snapshot reported no name conflict). This is a new action for the `techcrunch` domain.
- The explore plan in the command-family plan §5 `techcrunch/get-popular` states the Most Popular module is server-rendered only on the homepage `https://techcrunch.com/` (about 5-10 recent popular items), has no standalone page and no API, and must be parsed from the homepage HTML. The standalone explore trace (an exploration workspace) is not present in this workspace, so the DOM structure was re-verified first-hand with the Playwright CLI (attached to the user's Chrome) and confirmed against a raw `curl`/Node `fetch` of the homepage HTML. All structural facts below come from this first-hand verification.
- A Playwright CLI session was created for this capture and used only to read the live homepage DOM (new self-owned tab at `https://techcrunch.com/`).
- Node runtime contract consulted before drafting `command.js`.

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

- `https://techcrunch.com/` — homepage; the single data source. Returns HTTP 200 for both `curl -L --compressed` and Node's global `fetch` (undici). HTML is fully server-rendered; the Most Popular module and its card markup are present verbatim in the raw HTML with no JavaScript required.
- Article URLs extracted from the module on 2026-08-14 (7 items), e.g.:
  - `https://techcrunch.com/2026/08/12/some-claude-users-are-mad-that-anthropics-new-watermarks-will-catch-them-cheating-at-their-jobs-classes/`
  - `https://techcrunch.com/2026/08/11/phoebe-gates-and-sophia-kianni-reportedly-knew-phia-was-cookie-stuffing-for-months/`
- Author profile URLs extracted from the module, e.g.:
  - `https://techcrunch.com/author/lucas-ropek/`
  - `https://techcrunch.com/author/dominic-madori-davis/`
  - `https://techcrunch.com/author/lorenzo-franceschi-bicchierai/`

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

Verified against the live DOM (Playwright) and the raw homepage HTML (curl + Node fetch). The homepage is a WordPress site (block templates); the module markup is:

- Module container (unique on the page): `<div class="wp-block-group wp-block-techcrunch-most-popular-posts ...">`. The class token is exactly `wp-block-techcrunch-most-popular-posts` (followed by a space or closing quote); the sibling `__heading` and `__icon` elements are `wp-block-techcrunch-most-popular-posts__heading` / `__icon` (underscore suffix), so a `(?=\s|")` boundary distinguishes the container.
- Inside the container: `<div id="wp-block-techcrunch-most-popular-posts__heading">` with `<h2 id="h-most-popular">Most Popular</h2>`, followed by `<div class="wp-block-query ...">` → `<ul class="wp-block-post-template ...">`.
- Each popular item is a direct `<li class="wp-block-post post-<id> ...">` inside the post-template `<ul>`. Each `<li>` holds exactly one card:
  - `<div class="wp-block-techcrunch-card wp-block-null">` → `<div class="loop-card loop-card--post-type-post ...">` → `<div class="loop-card__content">`.
  - Title: `<h3 class="loop-card__title">` → `<p id="speakable-summary">` → `<a class="loop-card__title-link" href="<article-url>">Title text</a><br />`. The anchor may carry `data-destinationLink`/`data-event`/`data-module` attributes, and `href`/`class` order varies, so anchor parsing must read `href` and `class` from anywhere in the tag.
  - Author: `<div class="loop-card__meta">` → `<ul class="loop-card__meta-item loop-card__author-list">` → `<li>` → `<a class="loop-card__author" href="<author-profile-url>">Author name</a>`. Note the nested `<li>`, so `<li>` block extraction must use depth counting, not a naive `</li>` cut.
  - There is no `<time>` / `[datetime]` / date element anywhere in the card — the module shows no publish date. The `date` output field is therefore always `null`.
- The module currently renders 7 items (within the planned 5-10 range). Item count is expected to fluctuate day to day; the command returns whatever the module contains and marks `partial: true` when the requested `limit` exceeds the available count.
- Node's global `fetch` (undici) retrieves the techcrunch.com homepage directly: a plain `fetch('https://techcrunch.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } })` returns HTTP 200 with the full homepage HTML (decompressed automatically), and the module/card markers are present.

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

- HTTP 403 or 429 on the homepage → rate limited / blocked → report `RATE_LIMITED`.
- HTTP 404 on the homepage → `NOT_FOUND`.
- Other non-2xx status → `API_ERROR`.
- Network error / fetch timeout → `NETWORK_ERROR`.
- Response body that is not an HTML page (no `<html` in the head and tiny body) → `DRIFT_DETECTED`.
- Module container selector (`wp-block-techcrunch-most-popular-posts`) absent from the HTML → `DRIFT_DETECTED` (page structure changed).
- Module present but zero `<li class="wp-block-post">` items → `EMPTY_RESULT`.
- Invalid `limit` (non-digit, out of range 1-20) → `INVALID_PARAM` (validated on the raw string before parsing, to avoid `parseInt` truncation like `"5abc"` → 5).

## Capture Assessment

<!-- State whether this command should be captured and why. -->

Yes. The Most Popular module is TechCrunch's only reader-popularity signal and answers a distinct user task from `techcrunch/get-latest` (chronological feed). It is a small, fixed, server-rendered block on the homepage with no API or standalone page, so a dedicated node command that parses the homepage HTML is the correct and only viable path. The structure was verified first-hand in the live browser and in the raw HTML, and the extraction logic was validated end-to-end against a live fetch (7 clean items with correct title/URL/author). Risk is low: one page, one request, clear failure modes.
