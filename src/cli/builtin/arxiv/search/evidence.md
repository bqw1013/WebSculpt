# Evidence: arxiv/search

This document records the research and validation evidence for the `arxiv/search` command.

## Exploration Path

The command library was checked: `arxiv` domain currently has one builtin command `arxiv/search-papers` (source: builtin, limit capped at 50, no date/category/field filters, returns no totalResults). This new `arxiv/search` command replaces it. Exploration verified in a prior explore workspace (assess status: passed). All path facts below were verified by direct `curl` calls to the official public arXiv Atom API; no browser automation was used.

## Verified URLs

- `https://export.arxiv.org/api/query` — official public Atom API. Endpoint used for all searches. Verified with combinations of `search_query`, `start`, `max_results`, `sortBy`, `sortOrder` (HTTP 200; 400 on empty/invalid `search_query`).
- `https://arxiv.org/search/?query=vision+transformer&searchtype=all` — web basic search, used only for semantic comparison (19,256 results for "vision transformer").
- `https://arxiv.org/search/advanced?...` — advanced search form, used for field/date semantic comparison (field=title → 2,063).

## Structural Evidence

Feed-level elements (verified in real responses):
- `<opensearch:totalResults>30431</opensearch:totalResults>` — total hit count.
- `<opensearch:startIndex>0</opensearch:startIndex>` — current page offset.
- `<opensearch:itemsPerPage>3</opensearch:itemsPerPage>` — requested page size.

Entry-level elements (each `<entry>` contains):
- `<id>http://arxiv.org/abs/2608.13560v1</id>` — ID includes a version suffix (`v1`); command strips the `v\d+` suffix for `Paper.id`.
- `<title>...</title>`, `<summary>...</summary>` — title and full abstract (may contain LaTeX escapes such as `\\textbf{...}`).
- `<published>2026-08-13T17:59:57Z</published>` — submission timestamp (ISO 8601).
- `<updated>...</updated>` — last-updated timestamp.
- `<link href="https://arxiv.org/abs/2608.13560v1" rel="alternate" type="text/html"/>` and `<link href="https://arxiv.org/pdf/2608.13560v1" rel="related" type="application/pdf" title="pdf"/>` — abs page and PDF links; command reconstructs `url`/`pdfUrl` from the stripped ID.
- `<category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>` — every category, including the primary one; `Paper.categories` collects all.
- `<arxiv:primary_category term="cs.CV"/>` — primary category.
- `<author><name>Weixuan Sun</name></author>` (repeated) — author names; `Paper.authors` collects all.
- Optional elements present in some entries: `<arxiv:comment>`, `<arxiv:journal_ref>`, `<arxiv:doi>`.

`search_query` semantics (verified):
- Field prefixes: `all`→`all`, `title`→`ti`, `author`→`au`, `abstract`→`abs`, `comments`→`co`, `journal_ref`→`jr`, `doi`→`doi`, `paper_id`→`id`. All 8 verified (e.g. `ti:"vision transformer"` → 1,932; `au:vaswani` → 157; `id:1706.03762` → 1 "Attention Is All You Need"; `doi:10.1038/s41586-020-2649-2` → 1).
- Bare space (`+`) is normalized by the API to OR (`all:vision transformer` → `all:vision OR all:transformer`, total 363,951).
- Plain multi-word keywords → split on whitespace and AND-join with the field prefix (`ti:vision AND ti:transformer` → 2,111, closely matching the web advanced search field=title count of 2,063). This is the chosen default semantics for plain queries.
- Native syntax passthrough when the query contains a field prefix or a boolean keyword (`AND`/`OR`/`ANDNOT`): `ti:transformer AND au:vaswani` → 5; `ti:transformer OR ti:attention` → 46,212; `all:transformer ANDNOT all:diffusion` → 168,225.
- Quoted phrases work: `all:"vision transformer"` → 5,446; a bare quoted phrase is normalized to `all:"..."`.
- Category filter: `AND cat:cs.AI` → 30,504 with `all:agent`. Nonexistent category `cat:cs.NOTREAL` → totalResults 0 (not an error).
- Date range: `submittedDate:[YYYYMMDDHHMM TO YYYYMMDDHHMM]`. Full range `[202607010000 TO 202607312359]` → 2,450 with published dates inside the range. For date_to-only, the lower bound must be a real year: `190001010000` and `199101010000` both work (total 159,439); year `0000` causes HTTP 400. For date_from-only, upper bound `999912312359` works (total 6,137).
- Sorting: `sortBy=submittedDate` orders by submission (newest first with `sortOrder=descending`); `sortBy=lastUpdatedDate` orders by revision; `sortBy=relevance` returns best-match ordering. Mapping: `relevance`→`relevance`, `submitted_date`→`submittedDate`, `last_updated`→`lastUpdatedDate`.
- Pagination: `start=0&max_results=2` then `start=2&max_results=2` return disjoint successive entries; `startIndex` echoes `start`. `max_results=200` in one request returns exactly 200 entries (HTTP 200, ~500 KB, ~3.6 s). Requesting 200 when only 5 exist returns exactly 5 entries → `partial=true` when `entries.length < limit`.
- Empty/invalid `search_query` → HTTP 400 with `<title>Error</title>`; command validates `--query` non-empty client-side.

## Failure Signals

- HTTP 400 from the API (e.g. empty query, malformed `search_query` like year-0000 date bound) — the API returns an XML page titled "Error"; command checks `res.ok` and throws a coded error rather than trying to parse.
- Network failure / non-2xx status — throw `API_ERROR` with the status code.
- API returns entries fewer than `limit` — signal `partial: true` (listing exhausted), not a failure.
- API returns 0 results — return `{totalResults: 0, papers: [], partial: false}` (successful empty result, distinct from an error).
- Rate limit / throttling: arXiv asks for ≥3 s between consecutive requests. The command issues a single request for `limit` (≤200), so it does not paginate; `max_results` is set to the requested `limit` in one call. Future pagination would need ≥3 s sleeps.
- Drift risk: the Atom XML field names (`opensearch:totalResults`, `arxiv:primary_category`, `category term`, `author/name`) are stable upstream contracts; the regex parser uses these names.

## Capture Assessment

This path is worth capturing: keyword search of arXiv papers is a core, high-frequency research task; the builtin `search-papers` is inferior (limit 50, no field/category/date filters, no totalResults). The API path is public, stable, and fully verified with real samples (see trace.md). The command generalizes the verified `search_query` construction (plain AND semantics, native-syntax passthrough, category + date + sort filters) into reusable parameters, returns a documented structured contract, and is a drop-in replacement for the builtin. Capture recommended.
