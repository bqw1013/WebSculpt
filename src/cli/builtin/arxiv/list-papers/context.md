# Context

## Precipitation Background (Why This Command Exists)

Tracking a category's daily submissions is the most common arXiv workflow for researchers ("what's new in cs.AI today"). The category listing pages (`/list/{cat}/new`, `/list/{cat}/recent`, `/list/{cat}/{YYYY-MM}`) are the canonical source. No existing WebSculpt command covered them (only `arxiv/search-papers`, keyword search). Explore evidence verified in a prior explore workspace (assess passed, user confirmed).

## Value Assessment

High reuse value: researchers check a category's new/recent submissions daily; the command is parameterizable (category/period/month/limit) and returns the full listing stream as structured paper cards (id, title, authors, categories, date, abstract, abs/PDF links) — directly usable for downstream commands like `arxiv/get-paper` / `arxiv/download-paper`. arXiv is fully public (no login, no browser), so the command is cheap and reliable.

## Page Structure

- **new**: `https://arxiv.org/list/{cat}/new`. Page date in `<h3>Showing new listings for Friday, 14 August 2026</h3>`. THREE separate `<dl id='articles'>` blocks, each with its own `<h3>` section heading: `New submissions (showing N of N entries)` / `Cross submissions ...` / `Replacement submissions ...`. Abstracts inline as `<p class='mathjax'>`.
- **recent**: `https://arxiv.org/list/{cat}/recent?skip=0&show={25|50|100|250}`. One `<dl id='articles'>` block PER DAY, each with a day `<h3>` like `Fri, 14 Aug 2026 (showing 204 of 204 entries )`. Title-only (no abstracts). `show` accepts only 25/50/100/250/500/1000/2000.
- **month (API)**: `https://export.arxiv.org/api/query?search_query=cat:{cat} AND submittedDate:[{YYYYMM}010000 TO {YYYYMMDD}2359]&sortBy=submittedDate&sortOrder=descending&max_results={limit}`. Atom XML; entries carry `<published>` (original submission ISO), `<summary>` (abstract), `<category>`, `<arxiv:primary_category>`.
- **Entry card (all HTML)**: `<dt>` holds abs link `href ="/abs/{id}"` and pdf link `href="/pdf/{id}"`; `<dd>` holds `<div class='list-title mathjax'>` (Title:), `<div class='list-authors'>`, optional `<div class='list-comments mathjax'>` / `<div class='list-journal-ref'>`, `<div class='list-subjects'>` (category ids inside `(...)`), and (new only) abstract `<p class='mathjax'>`.

## Environment Dependencies

- None: no login, no browser, no third-party modules. Uses Node's built-in `https` module (same pattern as the proven builtin `arxiv/search-papers`) and global `fetch`-free design.
- arXiv API etiquette requires ≥3 seconds between consecutive requests. The command makes ONE request per invocation, so no internal pacing is needed; scripting repeated calls should space them ≥3s. Do NOT add parallel/concurrent arXiv requests.
- Node runtime sandbox: only built-in modules allowed; no inline `import()`.

## Failure Signals

- HTTP 400 on list pages → invalid/lowercase category; body contains "Invalid archive or category". Command throws `INVALID_CATEGORY`.
- HTTP 400 "Invalid show value" if a bad `show` is ever sent (command always uses valid values from `[25,50,100,250]`).
- Missing `<dl id='articles'>` / date header on a 200 page → structure drift → `DRIFT_DETECTED`.
- Atom API returns 200 with `totalResults=0` for an invalid-but-well-formed category (e.g. `cs.XX`): for `period=month` this surfaces as an empty result (`papers: []`, `partial: true`) — documented limitation; for `new`/`recent` the site's 400 catches it.
- Category count reference: ~155 valid values (verified from `arxiv.org/category_taxonomy`, 155 `<h4>` entries; 9 single-level archives like `hep-th` + 146 dotted sub-categories).

## Repair Clues

- If the HTML structure changes: re-verify the `<dl id='articles'>`, `list-title mathjax`, `list-authors`, `list-subjects`, and abstract `<p class='mathjax'>` selectors against a live page; update `parseHtmlEntries` / the section regexes.
- If the Atom API shape changes: re-verify `<entry>`, `<published>`, `<summary>`, `<category>`, `<arxiv:primary_category>`, `<opensearch:totalResults>` in `parseAtomEntries`.
- `period=month` semantics: returns papers ORIGINALLY SUBMITTED in the month (API `submittedDate`), which differs from the HTML monthly archive's "announced in month" set (includes cross-lists/replacements originally submitted earlier). This was a deliberate, user-confirmed design choice (the HTML archive has no per-paper dates and no abstracts); do not silently change it.
- Alternative not taken (recorded in explore trace): HTML + `id_list` batch enrichment for month — faithful "announced" set with dates/abstracts but 2 requests and cross-list dates fall outside the month; kept as a backup if the API approach needs replacing.
