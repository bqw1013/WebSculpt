# Evidence: techmeme/get-timeline

This document records the research and validation evidence for the `techmeme/get-timeline` command.

## Exploration Path

Path verified in an explore workspace (explore assess: passed; user confirmed the contract on 2026-08-19). Command library check: no existing `techmeme` domain commands (`websculpt command list techmeme` -> "No commands available"); this is a brand-new command. Runtime contract consulted for the node runtime. No browser automation is needed — Techmeme River is fully static HTML served over plain HTTP (curl / node fetch return 200 with the complete timeline).

The path was re-verified during capture against the live site (2026-08-19): a fresh `curl -A "<Chrome 125 UA>" https://www.techmeme.com/river` returned HTTP 200 (178,114 bytes), 153 `tr.ritem` rows, and 6 date-group H2s — matching the explore snapshot. The parser was prototyped in node against the fresh HTML before being committed to `command.js`.

## Verified URLs

- https://www.techmeme.com/river (2026-08-19, HTTP 200, 153 `tr.ritem` rows / 6 date groups)

## Structural Evidence

The River page is a single static HTML document; there is no pagination and no `page=` parameter. Verified structural facts (from the live 2026-08-19 response):

### Date grouping and item rows

```html
<DIV ID="countercol">
  <H2>August 19, 2026</H2>
  <TABLE>
    <tr class="ritem"><td>1:15 AM &nbsp;&bull;</td><td><div class="rshr" id="s0" pml="260819p4" twid="..." twurl="..." mdurl="..." thurl="..." bsurl="..."></div><cite>Carl Franzen / <A HREF="https://venturebeat.com/">VentureBeat</A>:</cite>&nbsp; <a href="https://venturebeat.com/...">Block releases Berd, ...</a></td></tr>
    ...
  </TABLE>
  <H2>August 18, 2026</H2>
  <TABLE>...</TABLE>
  ...
</DIV>
```

- Each `<H2>` is a day group in "Month D, YYYY" format (e.g. `August 19, 2026`). The `<tr class="ritem">` rows immediately after each `<H2>` belong to that date.
- 153 rows with the exact class `class="ritem"` (no class variants), each with exactly 2 `<td>` cells, each with a `pml` attribute — 153/153 verified.
- After the last date group, the page footer contains `<H2>Sponsor Posts</H2>` and `<H2>Featured Podcasts</H2>` sections built from `<DIV CLASS="item">` blocks (not `tr.ritem`) — excluded naturally by selecting `tr.ritem` and by only assigning a date from H2s that match the calendar-date pattern.
- Reverse-chronological order confirmed: entries strictly decrease across (date, time) — the newest post is first, the oldest (6-day rolling window) is last.

### Field mapping inside one `<tr class="ritem">`

- `time`: first `<td>` text, e.g. `1:15 AM` (12-hour, AM/PM); the raw text is `1:15 AM &nbsp;&bull;` — strip the trailing bullet.
- `permalink`: the `pml` attribute of the `rshr` div, e.g. `260819p4` (yymmdd + "p" + N). It is unique per item and can be joined to `https://www.techmeme.com/260819/p4` (chainable to the planned `techmeme/get-story`).
- `cite` (author / source): the `<cite>...</cite>` element. When it contains ` / ` the left side is the author and the right side is the source (e.g. `Carl Franzen / VentureBeat` -> author `Carl Franzen`, source `VentureBeat`). When there is no ` / ` the author is absent (`null`) and the whole text is the source (e.g. `Wall Street Journal`). Verified on the live page: 52 of 153 entries (34%) have no author.
- `title` / `url`: the `<a href="...">...</a>` anchor that follows `</cite>&nbsp; `. The anchor text is the headline; `href` is the original-article URL.
- Titles and cite text contain HTML entities (`&ldquo;`, `&rdquo;`, `&amp;`, `&mdash;`, `&nbsp;`, `&bull;`) that must be decoded.

### Verified extraction result (node parser, live 2026-08-19 page)

```
TOTAL 153
[0]  { time:"1:15 AM", date:"August 19, 2026", title:"Block releases Berd, ...", author:"Carl Franzen", source:"VentureBeat", url:"https://venturebeat.com/...", permalink:"260819p4" }
[152]{ time:"2:25 AM", date:"August 14, 2026", title:"A look at Quincy, ...", author:"Nathaniel Meyersohn", source:"CNN", url:"http://www.cnn.com/...", permalink:"260814p4" }
```

By-date counts on the capture-day snapshot: `{Aug19:4, Aug18:46, Aug17:40, Aug16:13, Aug15:18, Aug14:32}` = 153 total. The counts float with posting volume (the explore snapshot a few hours earlier was `{Aug19:1, Aug18:46, Aug17:40, Aug16:13, Aug15:18, Aug14:35}`); total is not fixed.

## Failure Signals

- HTTP non-200 from the River URL (the page is public and anonymous; any non-200 is unexpected) -> throw `API_ERROR` (or `NOT_FOUND` for 404). Network/transport failure (fetch reject, timeout, DNS) -> `NETWORK_ERROR`.
- Rate limiting / anti-bot: Techmeme has been measured as rate-limit-free (58 requests incl. 20 back-to-back, all HTTP 200, no 429/403/challenge shell). The command still sleeps a random 200-700ms before the request per the project's polite pacing policy. If a 429/403 ever appears, throw `RATE_LIMITED`.
- Structure drift: if the 200 page contains no `tr.ritem` row (e.g. the row class or layout changes), the command throws `DRIFT_DETECTED` so a maintainer can re-verify.
- HTML entities in titles must be decoded; failure to decode shows raw `&ldquo;`/`&amp;` in output.
- `limit` is a number param; values that are not integers or fall outside 1-200 must be rejected before `parseInt` truncation — throw `INVALID_PARAM`.

## Capture Assessment

This command should be captured. The path is fully verified with real data (153 live rows extracted, date grouping, author-null cases, reverse-chronological order). It fills a clear gap: Techmeme's homepage is a curated feed (`get-feed`), while the River is the complete reverse-chronological timeline of everything Techmeme has posted in the rolling ~6-day window. It is a static public GET with no auth and no browser, one HTTP request per invocation, and reusable by anyone monitoring recent tech-news flow. Output is chainable to the planned `techmeme/get-story` via `permalink`.
