# Evidence: hackernews/get-ask

This document records the research and validation evidence for the `hackernews/get-ask` command.

## Exploration Path

Checked the Windows-host WebSculpt library with `websculpt command domains`, `websculpt command list hackernews`, and `websculpt hackernews search --help`. Existing `hackernews/get-new` and `hackernews/get-past` define reusable story-card conventions; `hackernews/search --type ask_hn` is keyword search and does not provide the chronological Ask stream. The verified path used direct HTTPS requests from the Node runtime: Firebase `askstories.json` for ordered IDs followed by Firebase `item/{id}.json` detail requests. The page endpoint was also inspected for semantic comparison.

## Verified URLs

- https://news.ycombinator.com/ask
- https://news.ycombinator.com/ask?p=2
- https://hacker-news.firebaseio.com/v0/askstories.json
- https://hacker-news.firebaseio.com/v0/item/49084404.json

## Structural Evidence

The live `/ask` HTML returned HTTP 200, title `Ask | Hacker News`, and 29 rows matching `<tr class="athing submission" id="{numericId}">`. Each row contains a rank, `item?id={id}` link, title, score, author link, age title with UTC timestamp, and a comments/discuss link. `/ask?p=2` returned HTTP 200 with zero rows and no `morelink` control in this observed dataset.

The live Firebase `askstories.json` response returned 29 numeric IDs. Comparing every ID against the page rows produced `mismatchCount=0`; first IDs were `[49058956, 49084404, 49093364]` and last IDs `[49082127, 49081599, 49081491]`. Each item response has `type`, `id`, `title`, `by`, Unix `time`, `score`, `descendants`, optional `url`, `text`, and optional `kids`. All 29 current Ask entries had `type: story`, a text body, and `url: null`. Sample item 49084404 had title `Ask HN: Crooked Timber showed showed me a virus captcha, What now?`, score 43, descendants 45, text length 1353, and 18 direct kids.

Title-prefix analysis across all 29 items yielded 15 `Ask HN:` titles, 1 `Tell HN:` title, and 13 titles without either prefix. The command therefore treats `askstories`/`/ask` section membership as authoritative, returns every item in that order, and derives `titleKind` only as an informational `ask | tell | other` label. It does not filter by title prefix. `createdAt` is derived from `time` as an ISO 8601 UTC string; `numComments` is derived from `descendants`; `isTextPost` is `url == null`.

## Failure Signals

The command requires access to the public Firebase HN API but no browser, login, or API key. A non-success response from the list or item endpoint is an upstream failure; HTTP 429 maps to `RATE_LIMITED`, other non-success statuses map to `API_ERROR`, and fetch/timeout failures after the bounded retry map to `NETWORK_ERROR`. An empty ID list or no eligible item maps to `EMPTY_RESULT`. Invalid or out-of-range `limit` values map to `INVALID_PARAM`. Missing/non-array `askstories` data or missing required item fields (`id`, `type`, `title`, `by`, `time`) map to `DRIFT_DETECTED`. Items that are deleted, non-story, or otherwise incomplete are skipped; if all are skipped, return `EMPTY_RESULT`. The public list is currently 29 entries, so `limit=50` returns all available entries without assuming that a second API page exists.

## Capture Assessment

Capture is appropriate: the public `askstories` endpoint was verified against the `/ask` page for the complete observed order, the item schema is stable and parameterizable, and the Node runtime avoids browser attachment. The command is read-only and reusable for default and bounded limits, with explicit error and schema-drift handling.
