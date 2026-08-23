# Context

## Precipitation Background (Why This Command Exists)

Captured on 2026-07-23 for a multi-platform content search use case. HackerNews was selected as the first "pure API / no browser" platform candidate. Explored in a prior explore workspace (`explore assess`: passed), where the Algolia HN Search API was verified end-to-end with curl: both endpoints, all four content type tags, the 1000-result pagination ceiling, and `numericFilters` time filtering all confirmed against live HTTP 200 responses with real data samples.

## Value Assessment

High reuse value. HackerNews is a primary source for tech content discovery; a keyless, login-free, browser-free JSON API makes this the cheapest and most stable command in the library. Reuses a unified parameter model (query/limit/type/sort/time), so downstream normalization needs no special-casing beyond the adapter table. Saves repeated rediscovery of endpoint names, tag values, the pagination cap, and the numericFilters time-filter idiom.

## Page Structure

No pages — pure HTTP JSON API:

- `GET https://hn.algolia.com/api/v1/search?query=...&tags=...&hitsPerPage=...` — relevance (points-weighted).
- `GET https://hn.algolia.com/api/v1/search_by_date?...` — newest first (same params).
- `tags`: `story` / `comment` / `ask_hn` / `show_hn` (comma-combinable, command uses one).
- Time filter: `numericFilters=created_at_i>{unix_ts}` with thresholds day=86400s, week=604800s, month=2592000s, year=31536000s.
- Pagination window: `page * hitsPerPage <= 1000` — verified: `hitsPerPage=1000` returns `nbPages: 1`.
- Response: top-level `hits[]`, `nbHits`, `nbPages`, `page`. Story hit: `objectID, title, url, author, created_at, created_at_i, points, num_comments, children, _tags, _highlightResult, updated_at`; ask_hn adds `story_text`, lacks `url`; comment hit instead has `comment_text, parent_id, story_id, story_title, story_url` and no `title`/`url`/`num_comments`.

## Environment Dependencies

None. No login, no API key, no browser, no signing. Node runtime with global `fetch`. Rate limits were not hit during 8+ consecutive probe requests; still, the command fetches a single page per invocation and does not paginate concurrently.

## Failure Signals

- `DRIFT_DETECTED`: response JSON missing top-level `hits` array — primary schema-change signal.
- Field-level drift: hits missing `objectID`, or per-type fields renamed (e.g. `num_comments`, `comment_text`) — mapped fields silently become `null`; check raw response.
- `UPSTREAM_ERROR`: non-200 or network failure from `hn.algolia.com` (outage / rate limit).
- Algolia behavior quirks to remember: no popularity sort endpoint exists (only relevance and by-date); `points` can be null on comments.

## Repair Clues

- If the command breaks, first replay the verified URLs in `evidence.md` with curl to isolate API-side vs implementation-side failure.
- Official API docs: https://hn.algolia.com/api (documents endpoints, tags grammar including `author_X` / `story_X` filters, and numericFilters).
- Alternative HN data source if Algolia degrades: official Firebase API (`https://hacker-news.firebaseio.com/v0/`) — but it has no full-text search, only item lookup and top/new lists, so it cannot back this command's semantics; a `hackernews/get-top`-style command could use it.
- Related same-domain command in the global library: `hackernews/get-top` (top stories list) — different action, no overlap.
