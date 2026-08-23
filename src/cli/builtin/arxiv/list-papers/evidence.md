# Evidence: arxiv/list-papers

This document records the research and validation evidence for the `arxiv/list-papers` command.

## Exploration Path

Command library overlap check: `websculpt command list arxiv` shows only `arxiv/search-papers` (builtin, keyword search via Atom API). No existing command covers category listing streams (`/list/{cat}/new|recent|{YYYY-MM}`); `list-papers` is a new command complementary to `search-papers`.

Runtime: node. All data comes from arXiv's public static HTML listing pages and the public Atom API (`export.arxiv.org/api/query`). Direct `curl` calls returned HTTP 200 with no login, JS rendering, CAPTCHA, or rate-limit blocks. Exploration verified in a prior explore workspace (assess passed, confirmation recorded). Runtime contract for the node runtime consulted.

arXiv API etiquette requires ≥3 seconds between consecutive requests; the command enforces this internally when more than one request is needed.

## Verified URLs

- https://arxiv.org/list/cs.AI/new (HTTP 200; three `<dl id='articles'>` blocks: New 85 / Cross 119 / Replacement 95; inline abstracts; page date in `<h3>Showing new listings for Friday, 14 August 2026</h3>`)
- https://arxiv.org/list/cs.AI/recent (HTTP 200; default `?skip=0&show=50` shows newest day only; day-grouped via one `<dl id='articles'>` per day)
- https://arxiv.org/list/cs.AI/recent?skip=0&show=250 (HTTP 200; spans 2 day blocks: Fri 204 entries + Thu 46 entries; `show` accepts only 25/50/100/250/500/1000/2000)
- https://arxiv.org/list/cs.AI/2026-07 (HTTP 200; monthly archive, 4730 total entries, single `<dl>` block, NO per-paper dates and NO abstracts; "Total of 4730 entries" in `<div class='paging'>`)
- https://export.arxiv.org/api/query (Atom API over https, HTTP 200; `search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=N` returns totalResults; `AND submittedDate:[202607010000 TO 202607312359]` returns 4347 for cs.AI July 2026; `id_list=` batch works with 30+ IDs)
- Error paths: https://arxiv.org/list/cs.ai/new (lowercase), /list/nonexistent/new, /list/cs.AI/recent?show=9999 — all HTTP 400.

## Structural Evidence

### HTML listing pages (new/recent/month)

- Entry list container: `<dl id='articles'>`. Each `<dt>` holds the paper id and links; each following `<dd>` holds the metadata.
  - `<dt>`: `<a name='item1'>[1]</a>`, abs link `<a href ="/abs/{id}" title="Abstract" id="{id}">`, pdf link `<a href="/pdf/{id}" title="Download PDF" id="pdf-{id}">`, html link `/html/{id}v1`, other formats `/format/{id}`.
  - `<dd>` fields: `<div class='list-title mathjax'><span class='descriptor'>Title:</span> ...`, `<div class='list-authors'>` (author `<a>`s linking to author search, text is the author name), `<div class='list-comments mathjax'>` (optional), `<div class='list-journal-ref'>` (optional), `<div class='list-subjects'>` with `<span class="primary-subject">Name (cat)</span>` followed by `; Name (cat)` siblings, abstract `<p class='mathjax'>` (INLINE ABSTRACTS ONLY on the `new` page).
  - Category ids extracted from text inside `(...)`: pattern `\(([a-zA-Z][a-zA-Z0-9\-]*(?:\.[A-Z][A-Z0-9]*)*)\)`.
- **new page**: page date from `<h3>Showing new listings for ({weekday}, )?{D} {Month} {YYYY}</h3>` (e.g. "Friday, 14 August 2026"). Three separate `<dl id='articles'>` blocks, each preceded by its own `<h3>`: "New submissions (showing X of X entries)" / "Cross submissions ..." / "Replacement submissions ...". Group key derived from the h3 prefix. No pagination needed (cs.AI 299 entries < 2000; page shows all by default).
- **recent page**: one `<dl id='articles'>` block PER DAY, each with a day `<h3>` like "Fri, 14 Aug 2026 (showing 204 of 204 entries )" or "Thu, 13 Aug 2026 (showing first 46 of 211 entries )". Day date parsed as `{Ddd}, {D} {Mmm} {YYYY}`. Footer `<ul>` lists per-day skip links (`?skip=204` = Thu start). NO abstracts. `show` must be one of 25/50/100/250/500/1000/2000.
- **month page**: single `<dl id='articles'>` block, no h3. Paging `<div class='paging'>Total of {N} entries : ...</div>`. NO per-paper dates, NO abstracts.

### Atom API (used for period=month)

- Endpoint: `https://export.arxiv.org/api/query` (https; http 301-redirects).
- Query: `search_query=cat:{cat} AND submittedDate:[{YYYYMMDD}0000 TO {YYYYMMDD}2359]&sortBy=submittedDate&sortOrder=descending&start=0&max_results={limit}`.
- Response XML fields per `<entry>`: `<id>http://arxiv.org/abs/{id}v{n}</id>`, `<title>`, `<published>YYYY-MM-DDTHH:mm:ssZ</published>` (original submission time), `<updated>`, `<link rel="alternate" type="text/html" href="{abs url}">`, `<link rel="related" type="application/pdf" href="{pdf url}">`, `<summary>` (abstract), `<author><name>...</name></author>` × N, `<category term="{cat}"/>` × N, `<arxiv:primary_category term="{cat}"/>`.
- `opensearch:totalResults` gives total hits for the query (used for `partial`).
- Semantics note: API `submittedDate` = ORIGINAL submission date (a paper cross-listed/announced in July may have been submitted in June, e.g. 2607.00001 published 2026-06-30). The HTML monthly archive is "announced in month" (4730 for cs.AI 2026-07) vs API "submitted in month" (4347). The command uses the API for month and documents this.

## Failure Signals

- Invalid/lowercase category on HTML pages → HTTP 400 with `<title>Invalid archive or category: {cat}</title>` → throw `INVALID_CATEGORY`.
- Invalid `show` value on list pages → HTTP 400 "Invalid show value. Valid values: 25, 50, 100, 250, 500, 1000, 2000" (command always uses valid values; defensive check only).
- Invalid month format for API query → API returns an Atom error or 400; command pre-validates `YYYY-MM`.
- Missing/empty required param `category` → throw `MISSING_PARAM`.
- Network/HTTP non-200 from arXiv → throw `HTTP_ERROR` (or `NOT_FOUND` for 404).
- Drift signal: if `<dl id='articles'>` or expected `<div class='list-title mathjax'>` is absent from an otherwise-200 page, the page structure has changed → throw `DRIFT_DETECTED`.
- No matches (e.g. empty recent week for a niche category, or empty month) → return empty array with `partial: true`, not an error.

## Capture Assessment

This command should be captured. arXiv category listings are the primary daily workflow for researchers ("what's new in cs.AI today"), and no existing WebSculpt command covers the `/list/{cat}/new|recent|{YYYY-MM}` pages. The path is fully verified (HTTP 200, SSR inline HTML, public API), parameterizable (category/period/month/limit), and reusable — a high-frequency, high-value command. Runtime is node with no auth or browser dependency.
