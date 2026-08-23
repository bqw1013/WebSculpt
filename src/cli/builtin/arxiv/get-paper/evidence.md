# Evidence: arxiv/get-paper

This document records the research and validation evidence for the `arxiv/get-paper` command.

## Exploration Path

Path verified in a prior explore workspace (explore assess: passed). Command library check: only `arxiv/search-papers` (builtin, keyword search) exists for the arxiv domain; no single-paper full-record command. Runtime contract for the node runtime consulted. No browser automation needed (arXiv is a static site; curl direct fetch returns 200).

Two paths were curl-tested and compared:
1. Abstract page HTML `https://arxiv.org/abs/{id}` — selected as the single source of truth.
2. Atom API `https://export.arxiv.org/api/query?id_list={id}` — rejected (no version history, second request required).

## Verified URLs

- https://arxiv.org/abs/2601.00001 (new-style ID, single version v1, cs.HC)
- https://arxiv.org/abs/1706.03762 (multi-version v1..v7, has Comments, cross-list cs.LG)
- https://arxiv.org/abs/hep-th/9901001 (old-style ID, has Journal reference + journal DOI)
- https://arxiv.org/abs/1207.7214 (large collaboration "The ATLAS Collaboration")
- https://arxiv.org/abs/1706.03762v1 (versioned URL behavior)
- https://arxiv.org/abs/1706.03762v99 (invalid version -> HTTP 404)
- https://arxiv.org/abs/9999.99999 (nonexistent id -> HTTP 404)
- https://export.arxiv.org/api/query?id_list=2601.00001 (Atom API comparison)
- https://export.arxiv.org/api/query?id_list=hep-th%2F9901001 (Atom API contains arxiv:comment/journal_ref/doi)

## Structural Evidence

All extraction targets below were observed in real responses (HTTP 200).

### ID and metadata (meta tags in <head>)

```html
<meta name="citation_title" content="Attention Is All You Need"/>
<meta name="citation_author" content="Vaswani, Ashish"/>   <!-- "Last, First M." format, repeated N times -->
<meta name="citation_date" content="2017/06/12"/>           <!-- v1 submission date, YYYY/MM/DD -->
<meta name="citation_online_date" content="2023/08/02"/>    <!-- requested version's online date -->
<meta name="citation_pdf_url" content="https://arxiv.org/pdf/1706.03762"/>  <!-- always unversioned -->
<meta name="citation_arxiv_id" content="1706.03762"/>        <!-- canonical unversioned id -->
<meta name="citation_abstract" content="..."/>               <!-- abstract text, may contain HTML entities like &gt; -->
<meta name="citation_doi" content="10.1143/PTP.101.1155"/>   <!-- ONLY present when a journal DOI exists -->
```

### Left column body

```html
<h1 class="subheader">Computer Science > Human-Computer Interaction</h1>  <!-- primary category full name (not used) -->
<div class="dateline">[Submitted on 12 Jun 2017 (v1), last revised 2 Aug 2023 (this version, v7)]</div>
<h1 class="title mathjax"><span class="descriptor">Title:</span>Attention Is All You Need</h1>
<div class="authors"><span class="descriptor">Authors:</span><a href="..." rel="nofollow">Ashish Vaswani</a>, <a href="..." rel="nofollow">Noam Shazeer</a>, ...</div>
```

Authors: every author is an `<a>` element inside `.authors`; the text is natural order "First Last". Collaboration papers render a single author like "The ATLAS Collaboration".

### Version history (`.submission-history`) — the ONLY source of versions[]

```html
<div class="submission-history"><h2>Submission history</h2> From: Kai Liu [...] <br/>
<strong><a href="/abs/1706.03762v1" rel="nofollow">[v1]</a></strong> Mon, 12 Jun 2017 17:57:34 UTC (1,102 KB)<br/>
...
<strong>[v7]</strong> Wed, 2 Aug 2023 00:41:18 UTC (1,124 KB)<br/>
</div>
```

- Old versions wrap `[vN]` in an `<a>`; the current/latest version is a plain `<strong>[vN]</strong>`.
- Date text format: `Mon, 12 Jun 2017 17:57:34 UTC` (RFC2822; `new Date(...)` parses it).
- Parse pattern: `\[v(\d+)\]` followed by a date match `<weekday>, <d> <Mon> <YYYY> <HH:MM:SS> UTC`.
- `publishedAt` = first version's date; `updatedAt` = last version's date (stable regardless of requested version).

### Metatable (`.metatable` table of `<tr>` rows, first td=label, second td=value)

Verified labels and value structures:

```html
<tr><td class="tablecell label">Comments:</td><td class="tablecell comments mathjax">15 pages, 5 figures</td></tr>
<tr><td class="tablecell label">Subjects:</td><td class="tablecell subjects"><span class="primary-subject">Computation and Language (cs.CL)</span>; Machine Learning (cs.LG)</td></tr>
<tr><td class="tablecell label">Cite as:</td><td class="tablecell arxivid">arXiv:1706.03762 [cs.CL]</td></tr>
<tr><td class="tablecell label">&nbsp;</td><td class="tablecell arxividv">(or arXiv:1706.03762v7 [cs.CL] for this version)</td></tr>
<tr><td class="tablecell label">&nbsp;</td><td class="tablecell arxivdoi"><a href="https://doi.org/10.48550/arXiv.1706.03762">...</a> ... arXiv-issued DOI via DataCite</td></tr>
<tr><td class="tablecell label">Journal&nbsp;reference:</td><td class="tablecell ...">Prog.Theor.Phys.101:1155-1164,1999</td></tr>
<tr><td class="tablecell label">Related DOI:</td><td class="tablecell ..."><a href="https://doi.org/10.1143/PTP.101.1155">...</a></td></tr>
```

- Subjects cell: categories rendered as `Full Name (cs.CL); Full Name (cs.LG)`; category codes are the parenthesized tokens. First is primary (wrapped in `span.primary-subject`), the rest are cross-list. Category id pattern: `[a-z][a-z0-9-]*(\.[A-Z][A-Za-z0-9]*)?` (e.g. cs.HC, cs.LG, hep-th, astro-ph.CO).
- Every paper carries an arXiv-issued DataCite DOI `10.48550/arXiv.{id}` in the `arxivdoi` row.
- A journal DOI, when present, appears both as `citation_doi` meta and in a `Related DOI` row.

### URL forms verified

- Bare id: `2601.00001`, `2601.00001v2`, `hep-th/9901001`, `hep-th/9901001v3`
- Full abs URL: `https://arxiv.org/abs/1706.03762`, with trailing slash redirects to clean URL; `http://` redirects to `https://`; `https://export.arxiv.org/abs/...` also works.
- Full pdf URL: `https://arxiv.org/pdf/1706.03762v2` serves the PDF, so pdf URLs must be normalized to the abs path.
- Versioned abs URL `/abs/1706.03762v1` returns HTTP 200 and shows "this version" in the dateline; `citation_online_date` reflects the requested version; canonical link stays unversioned.

## Failure Signals

- HTTP 404 for `/abs/{id}` when the paper does not exist (title `[...] Article identifier not recognized`) or the version is invalid (`[...] Article not found`, body hints the latest version). Detect via `response.status === 404` -> throw `NOT_FOUND`.
- Network/transport errors (fetch reject, 5xx, connection failure) -> rethrow as command error.
- Structure drift: if `.submission-history` or `citation_arxiv_id` is missing from a 200 page, throw `DRIFT_DETECTED`.
- arXiv API etiquette: keep >=3s between requests; this command makes exactly one request per invocation so it is naturally compliant.
- HTML entities (`&gt;`, `&amp;`, `&quot;`, `&lt;`, `&#39;`, numeric `&#\d+;`) appear in `citation_abstract`/`citation_title` and must be decoded.

## Capture Assessment

This command should be captured. The path is fully verified with real data (new-style ID, old-style ID, multi-version, collaboration author list, 404 behavior). It fills a clear gap (single-paper complete record) that `arxiv/search-papers` cannot cover, is a static GET with no auth or browser, and is reusable by any user who needs the full record behind a paper ID. Output is chainable to the planned `arxiv/download-paper` via `pdfUrl`.
