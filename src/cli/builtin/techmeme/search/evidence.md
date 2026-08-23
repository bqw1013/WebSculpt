# Evidence: techmeme/search

This document records the research and validation evidence for the `techmeme/search` command.

## Exploration Path

No existing techmeme-domain command existed in the library at explore time (`websculpt command list techmeme` returned "No commands available."), so this is a new command. The explore path verified the path with plain `curl` / Node `fetch` against `www.techmeme.com` — every request returned HTTP 200 with no 403 / JS challenge / CAPTCHA, so no browser was needed. The verified selectors and pagination model are reused verbatim. A 58-request rate test (20 rapid fire + 3 rounds across endpoints) showed zero 429/403/abort responses, so the command runs on the `node` runtime and still sleeps 200-700ms before each request per the project-wide polite pacing rule.

## Verified URLs

- `https://www.techmeme.com/search/query?q=anthropic` — 200; "Results 1 - 10 of about 4099:"; 10 parseable items.
- `https://www.techmeme.com/search/query?q=openai` — 200; "Results 1 - 10 of about 9180:"; 10 items.
- `https://www.techmeme.com/search/query?q=iphone` — 200; "Results 1 - 10".
- `https://www.techmeme.com/search/query?q=openai+funding` — 200; multi-word AND works; "Results 1 - 10 of about 3206:".
- `https://www.techmeme.com/search/query?q=zxqwvzqxqwzx` — 200; no H2 header, no items container, "Your search ... did not match any news items" (empty result → empty array).
- `https://www.techmeme.com/search/query?q=AI%20%E4%B8%AD%E6%96%87%26%E6%B5%8B%E8%AF%95` — 200; server correctly echoes the Chinese + `&` query, proving `q` must be `encodeURIComponent`d.
- `https://www.techmeme.com/search/query?q=anthropic&start=70/100/200/300/400/500/600/700/800/900/950/990` — 200; deep pagination returns the corresponding 10-item window each time.
- `https://www.techmeme.com/search/query?q=anthropic&start=990` — 200; "Results 991 - 1000 of about 4099:"; 10 items (last fetchable page).
- `https://www.techmeme.com/search/query?q=anthropic&start=1000/1001/1005` — 200; empty page (0 items, no Results header) — pagination cap is ~1000.
- `https://www.techmeme.com/search/query?q=anthropic&wm=false` — 200; "about 1354" (title+summary-only scope shrinks totals).
- `https://www.techmeme.com/260819/p1` — 200 (393,746 B); the "In context" link minus its `#a260819p1` fragment, i.e. the story-cluster base page that `techmeme/get-story` consumes.

## Structural Evidence

- Results container: `<DIV class="results"> > <DIV class="resultscanvas"> > <H2>Results N - M of about TOT:</H2> > <div class="items">`. Item blocks are `<DIV CLASS="item" ...>` ... `</DIV>`, up to 10 per page.
- The sidebar "Sponsor Posts" reuses `class="item"` and `<CITE>`/`<STRONG CLASS="L1">`, but lives in `<DIV class="sponsorscanvas">` after the results container closes. Parsing is therefore confined to the `items` container (`<div class="items">` ... `</div> <!-- items -->`), which excludes sponsors.
- Field anchors (verified across all 10 items of `q=anthropic`):
  - title + url: `<STRONG CLASS="L2"><A HREF="{original-url}">{title}</A></STRONG>` (STRONG is always L2 inside results).
  - summary: text after `</STRONG>` up to `<!--end ii-->`, minus the leading `&nbsp; &mdash;&nbsp;`; contains HTML entities (`&ldquo; &rdquo; &hellip; &amp; &mdash;` etc.) that must be decoded; the raw slice ends with the ii block's `</DIV>` which is stripped.
  - author: the `CITE` text before its source anchor, minus trailing ` / ` (null when absent, e.g. `<CITE><A HREF="https://www.anthropic.com/">Anthropic</A>:</CITE>`).
  - source: `{ name, url }` from the first `<A HREF>` inside `CITE` (name = link text, url = href).
  - published_at: `<SPAN CLASS="idate">{raw}</SPAN>`, e.g. "Aug 19, 2026, 12:15 AM" (kept verbatim).
  - permalink: the `<span class="icontext"><a href="{...}#a{...}">In context</a>` href with the `#a...` fragment removed (e.g. `https://www.techmeme.com/260819/p1#a260819p1` → `https://www.techmeme.com/260819/p1`).
  - image: `<IMG CLASS="ill" src="{relative}">`; relative paths resolved against `https://www.techmeme.com` (some oldest items genuinely have no image).
- Pagination: fixed 10 items/page; `start` is a 0-based offset (0/10/20/.../990). Header always carries the approximate total ("of about 4099"). `start >= 1000` returns an empty page. Both `/search/query?q=...&start=N` and `/search/d3results.jsp?q=...&wm=true&start=N` are equivalent; the command uses the `query` form.
- Empty result: no H2 Results header and no `items` container; page body says "did not match any news items". Treated as `[]` (not an error).
- Native search operators (`sourceurl:`, `sourcename:`, `date:`, `author:`, `title:`, `body:`, `link:`, `+ - AND OR NOT`, quoted phrases, multi-word AND) are honored by the server — `q` is passed through unchanged.

## Failure Signals

- HTTP 403/429 from `www.techmeme.com` → `RATE_LIMITED` (measured unlimited in explore, but handled defensively).
- Non-200 status → `API_ERROR`; fetch/abort failure → `NETWORK_ERROR`.
- Empty or truncated body (< 500 chars) → `API_ERROR` (drift guard).
- `q` missing/empty → `MISSING_PARAM`; `limit` not an integer or outside 1-1000 → `INVALID_PARAM`.
- Empty search result (no items container) → `[]`, not an error.
- Pagination reaching `start >= 1000` (or a page with 0 items) stops the loop; if fewer items than the requested limit were collected, each item carries `partial: true`.
- Drift signals to watch when the site changes: no `<div class="items">` container on a page that should have results; no `<STRONG CLASS="L2">` title anchor inside an item; `CITE` no longer containing a source anchor.

## Capture Assessment

This command should be captured. Techmeme is a high-value tech-news aggregation site, its search surface is fully anonymous and static (no login, no browser, no API key), and the path was verified against 30+ live requests including deep pagination, empty-result, unicode/`&`-encoding, and title/summary-scope variants. The output maps cleanly to a reusable search command and its `permalink` field chains into the sibling `techmeme/get-story` command (permalink base pages verified 200). No prerequisites, low drift risk, and the node runtime is the right choice since a browser adds no extra information.
