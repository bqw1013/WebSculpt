# Context

## Precipitation Background (Why This Command Exists)

Keyword search of arXiv papers is a core, high-frequency research task. The library already had a builtin `arxiv/search-papers` that was inferior: `limit` capped at 50, no field/category/date-range filters, no `totalResults`, and users had to hand-write the entire arXiv prefix syntax. `arxiv/search` replaces it with a convenient parameterized interface over the same official public Atom API, aligned with the rest of the arXiv command family (`list-papers`, `get-paper`, `get-author-papers`, `list-categories`, `download-paper`).

## Value Assessment

- High generality: every parameter combination (field, category, date range, sort, limit) maps to a documented behavior.
- High reuse frequency: paper keyword search is the most common arXiv task.
- Saves time: no need to remember the arXiv `search_query` syntax (`ti:`/`au:`/`abs:`/`cat:` prefixes, `submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`, `sortBy` values) or hand-build URLs.

## Page Structure

Data source is the public Atom API, not a page:

- Endpoint: `https://export.arxiv.org/api/query`
- Query params: `search_query` (URL-encoded), `start`, `max_results`, `sortBy`, `sortOrder`.
- `search_query` construction:
  - Native syntax (field prefix `(ti|au|abs|co|jr|cat|rn|id|doi|all):`, boolean `AND|OR|ANDNOT`, or a quoted phrase) → passed through verbatim.
  - Plain keywords → split on whitespace, each token prefixed with the field prefix, joined with ` AND ` (e.g. `ti:vision AND ti:transformer`). This matches arxiv.org's web search semantics closely (title AND count 2,111 vs web advanced 2,063).
  - Category → ` AND cat:{category}`.
  - Date range → ` AND submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`. date_from alone → upper bound `999912312359`; date_to alone → lower bound `190001010000` (year `0000` lower bound causes HTTP 400).
  - Sort mapping: `relevance`→`relevance`, `submitted_date`→`submittedDate`, `last_updated`→`lastUpdatedDate`; `sortOrder=descending` always.
- Feed XML: `<opensearch:totalResults>`, `<opensearch:startIndex>`, then one `<entry>` per paper with `<id>` (includes `vN` version suffix), `<title>`, `<summary>`, `<published>`, `<updated>`, `<category term="...">` (all categories), `<arxiv:primary_category term="...">`, repeated `<author><name>...</name></author>`, optional `<arxiv:comment>`, `<arxiv:journal_ref>`, `<arxiv:doi>`.
- The command strips the `vN` version suffix from the ID and rebuilds `url`/`pdfUrl` from it.

## Environment Dependencies

- Node runtime, global `fetch`, no third-party modules.
- Fully public API: no login, no browser, no API key.
- Rate limit etiquette: arXiv asks for ≥3 s between consecutive requests. The command issues a single request for the whole `limit` (max 200 verified stable), so no pagination loop exists today. If pagination is ever added, space requests ≥3 s apart with small jitter.
- `max_results=200` in one request returns exactly 200 entries (~500 KB, ~3.6 s) — verified stable.

## Failure Signals

- `MISSING_PARAM`: query empty (API returns HTTP 400 for empty `search_query`; validated client-side).
- `INVALID_PARAM`: unknown `field`/`sort_by` value, non-integer or out-of-range `limit`, malformed `date_from`/`date_to`. Message lists valid enum values so the caller can self-correct.
- `API_ERROR`: non-2xx response (HTTP 400 for a malformed native query — e.g. a dangling `AND` — or the year-0000 date-bound case) or network failure.
- Empty result is success: `{totalResults: 0, papers: [], partial: false}` — do not conflate with an error.
- `partial=true` when the API returns fewer entries than the requested `limit` (results exhausted).
- XML structure drift risk is low (stable upstream Atom schema); if `<opensearch:totalResults>` or `<entry>` regexes stop matching, totalResults defaults to 0 and papers to empty — revisit the entry regex.

## Repair Clues

- If the Atom API is unreachable or changes, the same `search_query` semantics are available through the web search endpoint `https://arxiv.org/search/?query=...&searchtype=all` (HTML, needs different parsing) and the advanced search form `https://arxiv.org/search/advanced`.
- The builtin `arxiv/search-papers` command is a fallback reference for Atom XML parsing (its `command.js` uses the same entry regex approach).
- Date bounds used internally (`190001010000` / `999912312359`) are safe sentinels verified to work; do not use `0000` as a lower bound.
