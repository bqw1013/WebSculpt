# Evidence: techmeme/get-feed

This document records the research and validation evidence for the `techmeme/get-feed` command.

## Exploration Path

- Explore workspace `techmeme-get-feed` passed audit (`explore assess` → `status: passed`, candidate `techmeme/get-feed`, Confirmation recorded 2026-08-19).
- Command library check: `websculpt command domains` lists 36 domains; techmeme has **zero** existing commands — `get-feed` is the first command in the domain (`new`, no conflict, no reuse).
- No browser automation was needed: all fetches were plain HTTP 200 via curl + node with a standard Chrome User-Agent. No JS challenge, no login, no API signature. Runtime fixed as `node`.

## Verified URLs

- https://www.techmeme.com/ — homepage (HTTP 200, 399KB on 2026-08-19). Source of the front-page curated feed.
- https://www.techmeme.com/260815/h1130 — historical snapshot (HTTP 200, 297KB) — same structure as homepage; H2 "Newest" replaced by "About This Page".
- https://www.techmeme.com/260818/p29 — story permalink page (HTTP 200) — the `get-story` input shape; confirms permalink URL construction `https://www.techmeme.com/{yymmdd}/p{N}`.
- https://www.techmeme.com/260815/ — HTTP 403 (Apache rejects directory-style URLs; disproves the plan's "date nearest match" assumption).
- https://www.techmeme.com/archives — HTTP 404 (no such page; Archives button only opens a JS date-picker form).
- https://www.techmeme.com/260815/h1131 — HTTP 404 (no server-side nearest-time redirect for existing-minute ±1).
- https://www.techmeme.com/260819/h2000 — HTTP 404 on today 08-19 (20:00 not reached yet) — proves h2000 is future-only for today and needs fallback.

## Structural Evidence

- H2 section order on homepage: `Top News | Sponsor Posts | Featured Podcasts | Newest | From Mediagazer | Upcoming Tech Events | More News | Earlier Picks`. Only **Top News / More News / Earlier Picks** carry story items.
- **Top News** stories are wrapped in `<DIV CLASS="clus">` clusters (1-3 `itc1`/`itc2` items each; extra items are same-event secondary reports). **More News / Earlier Picks** are bare `itc1`/`itc2` blocks without a `clus` wrapper.
- Every story = `<DIV CLASS="itc1"> > <DIV CLASS="itc2" ID="{yymmdd}p{N}">`. The pml id format is `{yymmdd}p{N}` (e.g. `260818p29`). A `<span id="s0i1" pml="260818p29" twid=... twurl=... mdurl=... thurl=... bsurl=...>` attribute carrier appears at the top of each `itc2`.
- Homepage story count on 2026-08-18 snapshot: **43 total** (top 27 = 22 clus + 5 relitems; more 8; earlier 8). Snapshot 260815/h1130: **31 total** (top 16 / more 8 / earlier 7).
- Title + link: `<STRONG CLASS="L5"><A CLASS="ourh" HREF="url">title</A></STRONG>`. Summary is the `&mdash;` text following `</STRONG>` inside the `ii` div (already truncated with `…` by the page; may be absent — 19/43 had none).
- Source/author cite: `<CITE>Author / <A HREF="site-url">Site Name</A>:</CITE>`; author may be absent (e.g. `<CITE>Apple:</CITE>`). Source is always present.
- Image: `<IMG CLASS="ill" SRC="/260818/i29.jpg">` — a **relative** URL needing `https://www.techmeme.com` prefix; may be absent (20/43 had none).
- **Official Techmeme social post links** are attributes on the story span: `twurl`(X/Twitter), `mdurl`(Mastodon techhub.social/@Techmeme), `thurl`(Threads), `bsurl`(Bluesky), `twid`(tweet id). **Individual attributes may be missing per item** (measured: 2/43 missing one of mdurl/thurl) — parse each attribute independently, tolerate null.
- **"More:" related reports** (visible collapsed state): `<SPAN CLASS="drhed">More:</SPAN>&nbsp;<span class="bls"><A HREF="url">Source Name</A>, ...</span>` — source name + link only, no title. 39/43 had related.
- **Discussion groups** (visible collapsed state): `<SPAN CLASS="drhed">Group:</SPAN>&nbsp;<span class="bls">...</span>`. Group keys measured: **X / LinkedIn / Bluesky / Mastodon / Forums** (LinkedIn is the 5th group the plan missed). 11/43 had no discussions at all. A `DIV CLASS="dbpt"` wraps each collapsed group.
- `permalink_url` is built from the **pml id itself**, never the page date: snapshot 260815/h1130's first story has pml `260814p32` (published 08-14, shown on 08-15). Format: `https://www.techmeme.com/{pml.slice(0,6)}/p{pml.slice(7)}`.
- Newest sidebar content overlaps the river and is NOT part of the 43 feed items — `get-feed` ignores it (covered by `get-timeline`).
- **Historical date access**: Techmeme stores snapshots at `https://www.techmeme.com/{yymmdd}/h{HHMM}`. The site's own date form defaults to **h2000 (20:00 ET)**; h2000 exists for all tested past dates 2006-2026, but fails 404 on today before 20:00. Fallbacks h1130 and h0000 both 200 on tested dates. No server-side nearest-time redirect exists (`h1131` → 404). `--date` = today (or omitted) uses the homepage directly.

## Failure Signals

- All pages serve anonymous HTTP 200 with a standard Chrome UA; **no rate limiting observed** across 58 requests (20 rapid homepage fetches + 3 rounds across endpoints). Command still applies 200-700ms random sleep per request as a general courtesy delay.
- `https://www.techmeme.com/{yymmdd}/` returns **403** — must never be used as the date URL.
- A `--date` for which h2000/h1130/h0000 all 404 → `NOT_FOUND` (no snapshot that day).
- Invalid `--date` format → `INVALID_PARAM`. Invalid/out-of-range `--limit` → `INVALID_PARAM`.
- If `itc2` blocks or the `ourh` title link pattern vanish (zero items extracted from a 200 page) → `DRIFT_DETECTED` (structure changed).
- Network failure / non-200 from the fetch layer → `NETWORK_ERROR` (5xx / timeout) or `API_ERROR` (unexpected non-200).
- The `Newest` sidebar and `Sponsor Posts`/`Featured Podcasts` sections must be skipped — they do not follow the story `itc2`/pml pattern.

## Capture Assessment

- Capture as `techmeme/get-feed`, runtime `node`, `authRequired: not-required`. Techmeme serves its entire curated feed as static HTML to anonymous clients with no login, no API key, no browser required. The homepage feed (Top News + More News + Earlier Picks clusters) and dated archive snapshots are the site's core product and directly reusable: default `limit 20` covers all of Top News; `--date` enables reviewing any day's snapshot. This is the domain's first command and the upstream of `get-story` (permalink chaining).
