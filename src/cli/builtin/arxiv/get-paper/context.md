# Context

## Precipitation Background (Why This Command Exists)

List/search commands only return paper cards; a user often needs the full record behind a single arXiv ID — the abstract to read carefully, the citation metadata (Comments, Journal reference, DOI) and the full version history, plus the PDF link. `arxiv/get-paper` covers that one-paper complete record. It is the detail counterpart to `arxiv/search-papers` (keyword search) and the planned `arxiv/list-papers` / `arxiv/search` / `arxiv/get-author-papers`.

## Value Assessment

- High generality: any arXiv paper can be addressed by ID or URL.
- Reuse frequency: high — fetching a single paper's full metadata is a core arXiv workflow.
- Time saved: parsing the abstract page (meta tags, version history, metatable) and handling ID normalization/entity decoding would otherwise be re-derived every time.
- Output is chainable: `pdfUrl` feeds directly into the planned `arxiv/download-paper`.

## Page Structure

Single source: `https://arxiv.org/abs/{id}` (static HTML, HTTP 200).

- Meta tags in `<head>`: `citation_title`, `citation_author` (N times), `citation_date` (v1 date), `citation_online_date`, `citation_pdf_url` (always unversioned), `citation_arxiv_id` (canonical unversioned id), `citation_abstract` (may contain HTML entities), `citation_doi` (only when a journal DOI exists).
- `.submission-history` div: the ONLY source of version history. Lines look like `<strong>[v1]</strong> Mon, 12 Jun 2017 17:57:34 UTC (1,102 KB)<br/>`; older versions wrap `[vN]` in an `<a>`, the current version does not.
- `.authors` div: authors as `<a>` elements (natural order text); collaboration papers show a single name.
- `.metatable` table rows: first td = label (`Comments:`, `Subjects:`, `Cite as:`, `Journal reference:`, `Related DOI:`, `Report number:`), second td = value. Labels may contain `&nbsp;`.
- Subjects cell: `Full Name (code); Full Name (code)`; the primary code is inside `span.primary-subject`.

## Environment Dependencies

- No login, no browser — static public site.
- Polite pacing: arXiv asks for >=3s between consecutive requests. This command makes exactly ONE request per invocation, so it is naturally compliant. If the implementation ever grows pagination/retries, space them >=3s with a small random jitter.
- Node runtime: only global `fetch` + built-ins (no third-party modules, no inline import).

## Failure Signals

- HTTP 404 on the abs page: nonexistent ID (`Article identifier not recognized`) or invalid version (`Article not found`) — throw `NOT_FOUND`.
- 200 page missing `citation_arxiv_id` or version history — structure drifted; throw `DRIFT_DETECTED`.
- Non-404 non-200 status, fetch abort, or network error — `REQUEST_FAILED`.
- Entity-encoded abstract/title (e.g. `H-&gt;ZZ^(*)`) must be decoded; failure to do so shows raw `&gt;` in output.

## Repair Clues

- If the `.submission-history` selector fails, inspect the abstract page HTML around the "Submission history" heading — the div structure may have changed (h2 inside div).
- If categories come back empty, re-check the subjects `<td>` class name and the category code pattern (`[a-z][a-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)?`).
- The Atom API (`export.arxiv.org/api/query?id_list={id}`) is a fallback for title/authors/abstract/categories/dates/comment/journal_ref/doi, but it does NOT expose version history — use it only as a cross-check, never as the sole source.
- ID normalization: strip URL protocol/host and `/abs/` or `/pdf/` prefix; keep old-style slashes (`hep-th/9901001`); strip trailing slashes.
