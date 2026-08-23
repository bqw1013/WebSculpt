# Context

## Precipitation Background (Why This Command Exists)

Techmeme is a widely-referenced tech-news aggregator, and its archive search is
the natural way to find "what Techmeme covered about topic X" with its own
editorial ranking. The explore phase proved the whole surface is anonymous static
HTML (no login, no browser), so the path became a cheap reusable `node` command
instead of a repeated manual scrape. It is the techmeme family's search entry
point; its `permalink` field chains into `techmeme/get-story`.

## Value Assessment

Reuse value is high: Techmeme search is a stable, dependency-free, rate-limit-free
surface (measured 58 requests with zero blocks). The command covers happy path,
deep pagination (up to ~1000 items), empty results, unicode/`&`-encoded queries,
and native search operators in one call — saving the caller from hand-building
URLs and HTML-parsing result cards. Generality: any keyword/operator query; the
output schema matches the sibling feed commands' card shape.

## Page Structure

- Entry: `GET https://www.techmeme.com/search/query?q={encodeURIComponent(q)}&start={offset}`
  (offset 0-based, step 10; `start >= 1000` returns an empty page).
- Results live in `<div class="results"> > <div class="resultscanvas"> >
  <div class="items">`; item blocks are `<DIV CLASS="item" ...>`. The sidebar
  Sponsor Posts reuse `class="item"` but sit in a separate `sponsorscanvas` —
  parsing must stay inside the items container.
- Item field anchors (all verified):
  - title/url: `<STRONG CLASS="L2"><A HREF="{url}">{title}</A></STRONG>`
  - summary: after `</STRONG>` up to `<!--end ii-->`, minus leading `&nbsp; &mdash;&nbsp;`
  - author/source: `<CITE>` text before/at its `<A HREF>` (author null when absent)
  - published_at: `<SPAN CLASS="idate">{raw text}</SPAN>` (kept verbatim)
  - permalink: `icontext` "In context" href minus its `#a...` fragment
  - image: `<IMG CLASS="ill" src="{relative}">` resolved against
    `https://www.techmeme.com` (oldest items may genuinely lack an image)
- Header: `<H2>Results N - M of about TOT:</H2>` (approximate total).
- Empty result: no H2 header, no items container, page shows "did not match any
  news items" → return `[]`.

## Environment Dependencies

- Anonymous GET; no login, no cookie, no browser. Standard Chrome UA is enough
  (project-wide polite pacing: random 200-700ms sleep before every request —
  Techmeme measured unlimited, but the rule applies).
- No third-party modules: pure Node built-ins (`fetch`, `setTimeout`).

## Failure Signals

- No `<div class="items">` container on a page that should have results → drift.
- No `<STRONG CLASS="L2">` title anchor inside an item → drift / parsing break.
- `CITE` with no source anchor → author/source parsing silently degrades.
- HTTP 403/429 → `RATE_LIMITED`; non-200 → `API_ERROR`; fetch/abort → `NETWORK_ERROR`;
  body < 500 chars → `API_ERROR` (truncation guard).

## Repair Clues

- If the results markup shifts, re-run explore against a live query and update the
  anchors in `parseItem`; the `div.results > div.resultscanvas` boundary and the
  `start` offset pagination model are the structural invariants most worth keeping.
- `d3results.jsp` is an equivalent URL form for the same pages if `/search/query`
  ever changes behavior (both were verified 200 during explore).
- Re-verify the empty-result and `start >= 1000` shapes if Techmeme changes their
  no-match page; the command intentionally treats those as `[]` rather than errors.
- When in doubt, a fresh explore (`websculpt explore`) of `q=anthropic` reproduces
  the full field inventory in one page load.
