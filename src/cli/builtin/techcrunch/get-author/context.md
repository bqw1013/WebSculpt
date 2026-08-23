# Context

## Precipitation Background (Why This Command Exists)

TechCrunch (WordPress) exposes most content via the public WP REST API, but the author dimension is locked down: `GET /wp-json/wp/v2/users` returns 404 and `GET /wp-json/wp/v2/posts?author={id}` returns an empty array. The only working channel for "give me this author's profile + articles" is the server-rendered archive page `https://techcrunch.com/author/{slug}/`, which this command parses. It was precipitated alongside the rest of the TechCrunch command family (get-feed / get-topic / search / get-article / get-popular / list-events / list-podcast-episodes) per the command-family plan.

## Value Assessment

Reporter-tracking scenario: after reading a byline, the user wants the author's full profile and article history. Reuse is high — every article card across the whole TechCrunch command family exposes author bylines that feed directly into `--author` (or the `author.slug` field of `techcrunch/get-article`). Without it there is no programmatic way to get an author's work on TechCrunch.

## Page Structure

- URL: `https://techcrunch.com/author/{slug}/`, pagination `https://techcrunch.com/author/{slug}/page/N/`. Page size 30 cards.
- HTTP status: valid author = 200; nonexistent slug = 404 (title "Page not found | TechCrunch"); page beyond last = 404.
- Author hero block (`div.author-hero`):
  - Name `h1.wp-block-techcrunch-author-archive-hero__title`
  - Position `p.wp-block-techcrunch-author-archive-hero__meta` (optional)
  - Bio `div.wp-block-techcrunch-author-archive-hero__bio` (optional)
  - Avatar `figure.tc23-author-archive-hero__media img` src (optional)
- Cards: `ul.wp-block-post-template > li.wp-block-post` (one per article). Fields extracted by regex:
  - categories from `category-{slug}` tokens in the li class (filter `tc`, `ben-test-2`)
  - title/url from `a.loop-card__title-link` (href + text)
  - date from `time.loop-card__time` `datetime` attribute (ISO with tz)
  - image from `figure.loop-card__figure img` src (optional; query stripped)
- Pagination: `a.wp-block-query-pagination-next` (href before class); absent on the last page.
- Cards contain NO excerpt (verified across authors) — `excerpt` is always empty.

## Environment Dependencies

- None: public server-rendered HTML, no login, no browser, no JS required. Node runtime.
- Polite pacing: a random 200–700ms sleep runs before each page request and pagination is serial, to keep cadence moderate. TechCrunch showed no 429/403 during verification at this cadence. If other TechCrunch commands run in parallel, keep cross-command spacing (test serially with random batch delays; do not hammer concurrently).

## Failure Signals

- Author slug validation is deliberately lenient (`[A-Za-z0-9._-]`): real slugs can contain capital letters (e.g. `margaux-macColl`). Only reject strings with spaces or characters that would break the URL path.
- First-page 404 → `NOT_FOUND` (author slug does not exist).
- Later-page 404 → archive exhausted, stop silently.
- Non-2xx non-404 → `HTTP_ERROR`.
- Network failure → `NETWORK_ERROR`.
- 200 page missing `h1.wp-block-techcrunch-author-archive-hero__title` → `DRIFT_DETECTED`.
- 200 page with zero `li.wp-block-post` cards after a valid hero → treated as a valid empty archive (empty `articles`, `partial: true`).
- Site change watchlist: the author hero class names (`wp-block-techcrunch-author-archive-hero__*`, `tc23-author-archive-hero__media`), card classes (`loop-card__title-link`, `loop-card__time`, `loop-card__figure`, `wp-block-post`), and the pagination anchor class (`wp-block-query-pagination-next`) all live in TechCrunch's WordPress theme templates; a theme redesign will break these and surface as `DRIFT_DETECTED`.

## Repair Clues

- If the WP REST `users` endpoint ever becomes public, the command could be re-implemented over `GET /wp-json/wp/v2/users?slug={slug}` + `posts?author={id}` (much simpler, no HTML parsing). Re-verify with curl before switching.
- If card markup changes, re-inspect the archive page DOM (browser attach) and update the three regexes in `parseCards` and the hero regexes in `parseAuthorHero`. The extraction was validated against real pages on 2026-08-14 for authors `lucas-ropek` (183 articles, 7 pages) and `brian-heater` (no position meta line, 3 cards without featured images).
