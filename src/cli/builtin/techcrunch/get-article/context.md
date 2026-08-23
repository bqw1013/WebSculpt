# Context

## Precipitation Background (Why This Command Exists)

TechCrunch list commands (`get-latest` / `get-feed`) return only article cards (title, URL, date, excerpt, image). Users need the full body of a single article for close reading, translation, and archiving. `get-article` fills that gap: given an article URL or slug, it returns the complete content plus the metadata needed to chain into the rest of the techcrunch command family.

Precipitated on 2026-08-14 during the TechCrunch command-family capture wave (8 commands captured in parallel).

## Value Assessment

- Turns any TechCrunch article URL (from get-feed, get-topic, search, get-author, get-popular, or any external source) into structured, machine-readable full content.
- One API request per call; no login, no browser — cheap and fast.
- `contentText` gives clean plain text for LLM consumption; `contentHtml` preserves the source markup.
- `author.slug` → `techcrunch/get-author`, `tags` → `techcrunch/get-topic`, `categories` → `techcrunch/get-feed` all chain directly.

## Page Structure

- Data source is the public WordPress REST API (not the HTML page): `GET https://techcrunch.com/wp-json/wp/v2/posts?slug={slug}&_embed=1`.
- Key fields: `title.rendered`, `link`, `slug`, `date`, `modified`, `content.rendered`, `excerpt.rendered`, `yoast_head_json.author`, `_embedded['wp:featuredmedia'][0].source_url`, `_embedded['wp:term']`.
- `_embedded['wp:term']` is an array of arrays; each term has a `taxonomy` field. Filter: `taxonomy === 'category'` → categories; `taxonomy === 'post_tag'` → tags; `taxonomy === 'author'` → author term whose slug starts with `cap-` (strip prefix). Do NOT rely on group index (custom taxonomies appear in between).
- Author slug is the `author` taxonomy term slug minus the `cap-` prefix (e.g. `cap-aisha-malik` → `aisha-malik`). Profile URL: `https://techcrunch.com/author/{slug}/`.

## Environment Dependencies

- None: public API, `runtime: node`, no auth (`authRequired: "not-required"`), no browser.
- Polite pacing: a random 200–700 ms sleep runs before each request. Commands run serially; when multiple techcrunch commands run concurrently they share the domain, so keep per-request cadence moderate.
- The WordPress users/coauthors REST route is blocked (`_embedded.author` is a 404 error object) — never rely on it; use `yoast_head_json.author` + the `author` taxonomy term.

## Failure Signals

- `[]` from the API → article slug does not exist → `NOT_FOUND`.
- Non-array 200 body → `DRIFT_DETECTED`.
- Non-2xx → `API_ERROR` (status in message).
- Network failure → `NETWORK_ERROR`.
- Missing/blank `url` → `MISSING_PARAM`; non-techcrunch host or malformed slug → `INVALID_PARAM`.
- Graceful degradation if embed data is missing: `categories`/`tags` → `[]`, `author.slug`/`image` → `null`.

## Repair Clues

- If the API returns 403/429 for sustained periods, the site may be rate-limiting; add a longer/randomized delay before the request rather than retrying hot.
- If `taxonomy` values change (e.g. `post_tag` renamed), fall back to group positions: first `category` group, next `post_tag` group, last group is `author`.
- If `yoast_head_json.author` disappears, derive the display name from the `author` taxonomy term's `name` field (may be an email-like string — verify against the article byline).
- Alternative source: parse the article HTML page (`/2026/08/13/{slug}/`) for `h1`, byline author link, category/tag links — the command's browser cross-check confirmed page and API agree on title, author, and tags.
