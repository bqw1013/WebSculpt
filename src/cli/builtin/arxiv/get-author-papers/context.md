# Context

## Precipitation Background (Why This Command Exists)

Tracing a scholar's papers is a high-frequency need, and arXiv's author-name format ("Last, F" abbreviation) is a known pitfall. This command wraps the author-search path so a user can pass a natural name and get a clean, newest-first paper list. It is one of a planned arXiv command family (list-papers / get-paper / search / get-author-papers / list-categories / download-paper), built as a user-source command to replace the builtin `arxiv/search-papers` eventually.

## Value Assessment

- High generality: any author lookup, no account/browser needed.
- Non-obvious conversion saved for the user: natural name → family-name `au:` query (the "Last, F" abbreviation fails on the Atom API, which is the key trap this command encodes).
- Replaces ad-hoc curl/node scripts; returns the same Paper card shape as sibling arXiv commands, enabling chaining (e.g. pipe IDs into `arxiv/get-paper` or `arxiv/download-paper`).

## Page Structure

Data source: `https://export.arxiv.org/api/query` (official Atom API, public).
- Query: `search_query={urlencoded}&start=0&max_results={limit}&sortBy=submittedDate&sortOrder=descending`
- `search_query` is `au:{FamilyName}` optionally ` AND cat:{Category}`.
- Response: XML with `<opensearch:totalResults>` and one `<entry>` per paper. Entry fields parsed: `<id>` (strip `http://arxiv.org/abs/` and `v\d+`), `<title>`, `<summary>` (abstract), `<published>` (ISO), `<category term="..."/>` (primary + cross-list), `<author><name>` repeated.
- Verified facts: `max_results=200` fills a 200 limit in one call; `sortBy=submittedDate&sortOrder=descending` gives newest-first (default is relevance); `cat:` matches primary OR cross-listed categories; zero-result query returns HTTP 200 with `totalResults=0`.

Author format findings (measured totals on 2026-08-14):
- `au:"LeCun, Y"` (the "Last, F" abbreviation) → 1 hit — NOT usable on the API.
- `au:LeCun` → 227 (case-insensitive, whole-word match; `au:lec` → 0, so no prefix false-positives).
- `au:"Yann LeCun"` / `au:"LeCun, Yann"` / `au:LeCun AND au:Yann` → 226 (misses one initials-variant paper).
- `au:"van der Maaten"` → 55 vs `au:Maaten` → 56 (last-token approximation ≈ quoted phrase).
- Common-surname noise is severe (`au:Wang` → 184,389) — inherent, documented in README.

## Environment Dependencies

- None: public API, no login, no browser. Node runtime (global `fetch`).
- Rate limit: arXiv asks for ≥3s between consecutive requests. The command normally makes ONE request (max_results ≤ 200 fills the limit), so no in-command pause in the happy path. A defensive pagination loop (3s + up to 1s jitter) guards the rare case the API returns fewer than requested while `totalResults` shows more.
- CLI runner injects manifest `default` values as strings (verified in `WebSculpt/dist/cli/engine/execution/dispatcher.js` `buildParams`).

## Failure Signals

- Non-200 from API → `API_ERROR` (arXiv-side outage; retry later).
- Transport failure reaching the API (DNS / connection reset / timeout) → `NETWORK_ERROR` (catch around `fetch()`; distinguishable from `API_ERROR`).
- Empty/whitespace `author` → `MISSING_PARAM`.
- `author` failing `^[\p{L}\p{M}'\-\.,\s]+$` (symbols/digits) or yielding empty family name → `INVALID_PARAM`.
- `limit` not matching `/^\d+$/` (validated before `parseInt` — no truncation) or outside 1-200 → `INVALID_PARAM`.
- Empty result is VALID output, not an error: `{ papers: [], count: 0, totalResults: 0, partial: true }`. Do not change this to a throw — the confirmed contract requires it.
- Drift risk: if arXiv changes the Atom XML shape, parsing returns empty lists and `totalResults=0` silently; the `opensearch:totalResults` regex and `<entry>` extraction are the two spots to re-verify first.

## Repair Clues

- Re-verify author query format against the live API before touching conversion logic (values drift as arXiv indexes change; re-measure `au:LeCun` etc.).
- Fallback entry point if the API becomes flaky: the web author-search page `https://arxiv.org/search/?searchtype=author&query={Last,+F}` returns the same hits in HTML (`arxiv-result` cards); it is lenient about "Last, F" and paginates with `&start=N`. Parsing HTML would replace `parseAtomXml` but keep the envelope and Paper shape.
- If the builtin `arxiv/search-papers` is later deleted, this command is unaffected (self-contained endpoint); sibling arXiv commands share the Paper shape, so keep field names in sync.
