# Evidence: hackernews/search

This document records the research and validation evidence for the `hackernews/search` command.

## Exploration Path

Checked `websculpt command list`: existing commands are bilibili/search, douyin/search, xiaohongshu/search, zhihu/search — all browser-based; no HackerNews or API-based command exists. Capture-time library snapshot shows a same-domain command `hackernews/get-top` (top stories list), no name conflict with `hackernews/search`. A prior explore workspace passed `explore assess` (status: passed, capture eligible: yes). Node runtime contract (`node-contract.md`) read. No browser involved.

Exploration was performed with plain `curl` HTTPS GETs against the Algolia HN Search API (`hn.algolia.com`), all returning HTTP 200. No API key, login, or signing required.

## Verified URLs

- https://hn.algolia.com/api/v1/search?query=rust&tags=story&hitsPerPage=2
- https://hn.algolia.com/api/v1/search_by_date?query=ai&tags=story&hitsPerPage=1
- https://hn.algolia.com/api/v1/search?query=rust&tags=comment&hitsPerPage=1
- https://hn.algolia.com/api/v1/search?query=&tags=ask_hn&hitsPerPage=1
- https://hn.algolia.com/api/v1/search?query=&tags=show_hn&hitsPerPage=1
- https://hn.algolia.com/api/v1/search?query=a&tags=story&hitsPerPage=1000
- https://hn.algolia.com/api/v1/search_by_date?query=ai&tags=story&hitsPerPage=2&numericFilters=created_at_i%3E1784175133

## Structural Evidence

Base endpoints (both verified HTTP 200, JSON):

- `GET /api/v1/search` — relevance-ranked search (points-weighted).
- `GET /api/v1/search_by_date` — same schema, sorted newest-first.

Shared query params:

- `query` (string, may be empty → returns everything; verified with empty query, nbHits ≈ 44M)
- `tags` (string): `story`, `comment`, `ask_hn`, `show_hn` all verified individually.
- `hitsPerPage` (int): 1000 accepted, but response shows `nbPages: 1` — Algolia pagination window is capped at 1000 results total (page*hitsPerPage ≤ 1000). This is the command's maxLimit basis.
- `numericFilters` (string): `created_at_i>{unix_ts}` verified — nbHits dropped from ~845K to 1476 with a 7-day threshold.

Top-level response keys (verified): `exhaustive, exhaustiveNbHits, exhaustiveTypo, hits, hitsPerPage, nbHits, nbPages, page, params, processingTimeMS, processingTimingsMS, query, serverTimeMS`.

Story hit keys (verified): `_highlightResult, _tags, author, children, created_at, created_at_i, num_comments, objectID, points, story_id, title, updated_at, url`. Sample: `{objectID: "22238335", title: "Why Discord is switching from Go to Rust", author: "Sikul", url: "https://blog.discordapp.com/...", points, num_comments, created_at: "2020-02-04T16:41:39.000Z"}`.

ask_hn hit: same as story plus `story_text`, no `url` field (self-post). show_hn hit: same as story.

Comment hit keys (verified): `_highlightResult, _tags, author, comment_text, created_at, created_at_i, objectID, parent_id, points, story_id, story_title, story_url, updated_at`. Note: no `title`, no `url`, no `num_comments`; `points` may be null.

Sorting capability: only `search` (relevance) and `search_by_date` (latest) exist; there is no dedicated popularity sort endpoint — `popular` must be treated as unsupported (ignoredParams).

## Failure Signals

- HTTP layer: non-200 from Algolia → upstream outage or rate limiting (not observed during 8+ consecutive probe requests).
- `EMPTY_RESULT`: `nbHits: 0` / empty `hits` array — valid outcome for no-match queries, surfaced as empty results (or error per contract).
- Drift signals: response missing top-level `hits` array, or hits missing `objectID` — indicates API schema change (`DRIFT_DETECTED`).
- Missing required `query` param → `MISSING_PARAM` client-side.
- Algolia hard cap: requests beyond 1000 results cannot paginate further; command must reject `limit > 1000` (`LIMIT_EXCEEDED`).
- Fields vary by type (e.g. ask_hn lacks `url`, comments lack `title`/`num_comments`); consumers must tolerate nulls.

## Capture Assessment

Should be captured. The path is fully verified with real HTTP 200 responses and real data samples across story/comment/ask_hn/show_hn types, both sort endpoints, hitsPerPage boundary, and numericFilters time filtering. The API is public, keyless, stable, and the parameter surface maps cleanly onto the unified interface spec (query/limit/type/sort/time). No browser, login, or polite-pacing concerns; a pure node-runtime command is sufficient and cheap to maintain.

