# Evidence: techcrunch/get-article

This document records the research and validation evidence for the `techcrunch/get-article` command.

## Exploration Path

- Library check: `websculpt command list techcrunch` shows one existing command `techcrunch/get-latest` (user source, node runtime, no browser, no login). No name conflict with `techcrunch/get-article`.
- Source trace: an exploration workspace (audit passed; cross-referenced in the sibling capture's evidence); contract finalized in the command-family plan (get-article section, treated as design suggestion).
- Runtime contract consulted before drafting `command.js`.
- Browser access guide consulted.
- API behavior re-verified with curl on 2026-08-14 (not assumed from plan): article-by-slug request, taxonomy field names inside `_embedded['wp:term']`, author term `cap-` prefix, featured media shape, missing-slug empty result.
- Browser cross-check on 2026-08-14 via a Playwright CLI session: a real article page (title, byline author + author URL, article tag links) matches the API response field-for-field.

## Verified URLs

- https://techcrunch.com/wp-json/wp/v2/posts?slug=investors-sue-selena-gomez-alleging-fraud-tied-to-her-mental-health-startup&_embed=1 (primary probe)
- https://techcrunch.com/wp-json/wp/v2/posts?slug=flock-says-its-new-tool-will-help-identify-police-abuse-but-hasnt-explained-how-it-works&_embed=1 (second author / different term shape)
- https://techcrunch.com/wp-json/wp/v2/posts?per_page=3&_fields=id,slug,link,title,date (slug discovery)
- https://techcrunch.com/2026/08/13/investors-sue-selena-gomez-alleging-fraud-tied-to-her-mental-health-startup/ (browser-verified article page)
- https://techcrunch.com/author/aisha-malik/ (HTTP 200; author profile URL construction confirmed)
- https://techcrunch.com/2026/08/13/no-such-article-xyz/ (HTTP 404 on page; API returns `[]` for unknown slug)

## Structural Evidence

- Endpoint: `GET https://techcrunch.com/wp-json/wp/v2/posts?slug={slug}&_embed=1` — public WordPress REST API, no auth, no browser required. Returns a JSON array with 1 post when found, `[]` when the slug does not exist (HTTP 200 both ways).
- Post object fields used:
  - `title.rendered` — title text with HTML entities (e.g. `&#8217;`), needs decoding.
  - `slug` — canonical slug. `link` — canonical article URL (e.g. `https://techcrunch.com/2026/08/13/{slug}/`).
  - `date`, `modified` — ISO 8601 `YYYY-MM-DDTHH:MM:SS` (server local time, no timezone suffix).
  - `content.rendered` — full article body HTML. `excerpt.rendered` — summary wrapped in `<p>…</p>`.
  - `yoast_head_json.author` — author display name (e.g. `Aisha Malik`).
  - `_embedded['wp:featuredmedia'][0].source_url` — featured image URL (field may be absent for image-less posts).
  - `_embedded['wp:term']` — array of arrays; each term object carries a `taxonomy` field. Verified taxonomies: `category` (e.g. `startups`, `biotech-health`), `post_tag` (e.g. `lawsuit`, `fraud`, `in-brief`), `author` (slug prefixed `cap-`, e.g. `cap-aisha-malik`). There are also custom taxonomies (event-related) with empty `taxonomy` name — ignore them. Filter by `taxonomy` field, not by group index, so category/tag/author extraction is robust to group ordering.
- Author slug: strip the `cap-` prefix from the `author` taxonomy term → `aisha-malik`. Profile URL: `https://techcrunch.com/author/{author-slug}/` (HTTP 200 verified).
- `_embedded.author` is NOT usable: the users/coauthors REST route is blocked and returns a `rest_no_route` 404 error object inside `_embedded.author`. Use `yoast_head_json.author` for the name and the `author` taxonomy term for the slug.
- TechCrunch has no comment system; no comment-related parameters exist. By user decision, no related-articles field is returned.
- Polite pacing: the API is public and stable; per access-politeness policy the command sleeps a random 200–700 ms before each request and runs serially (multiple techcrunch commands may hit the site concurrently).

## Failure Signals

- Empty array from the API (`[]`) → `NOT_FOUND` (requested slug does not exist). Distinct from success-with-empty-list: this command always targets exactly one article.
- HTTP 200 but body is not a JSON array → `DRIFT_DETECTED` (response shape changed).
- Non-2xx HTTP status → `API_ERROR` with status code.
- `fetch` throws (network/DNS/TLS) → `NETWORK_ERROR`.
- Missing/blank `url` → `MISSING_PARAM`. Full URL whose host is not techcrunch.com, or a slug with disallowed characters → `INVALID_PARAM`.
- Missing `_embedded` / missing term groups must not throw: categories/tags default to `[]`, author slug to `null`, featured image to `null`.

## Capture Assessment

Captured as `techcrunch/get-article`: it is the single-article full-content command for TechCrunch, a core capability (read full text, translate, archive) not covered by list commands (`get-latest`/`get-feed` return cards only). Reuses the verified public WordPress REST API channel with `_embed=1` for one request per call. Node runtime, no auth, no browser. Output matches the approved contract in `trace.md`/plan: `{title, url, slug, date, modified, author:{name,slug,profileUrl}, excerpt, contentHtml, contentText, image, categories[], tags[]}`. Categories and tags are returned as slugs for direct chaining into `techcrunch/get-feed --category` and `techcrunch/get-topic --topic`. Proceed to capture.
