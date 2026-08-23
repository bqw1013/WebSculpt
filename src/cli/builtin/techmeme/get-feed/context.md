# Context

## Precipitation Background (Why This Command Exists)

Techmeme had zero commands. The front-page feed (Top News / More News / Earlier Picks story clusters) is the site's core product and the upstream of `get-story` (permalink chaining). The explore workspace `techmeme-get-feed` (assess `passed`, Confirmation 2026-08-19) verified the real structure and corrected the original plan's wrong assumptions: there is **no** "input a date → server nearest-match" mechanism (`/{yymmdd}/` → 403, `/{yymmdd}/h1131` → 404), and discussion groups include a 5th key, **LinkedIn**, that the plan missed.

## Value Assessment

Reusable for "what does Techmeme's front page show right now / on a given past day", story curation, and as the feed source feeding pml permalinks into `get-story`. Techmeme is anonymous static HTML (no rate limit measured across 58 requests), so the command is cheap and stable. Reuse frequency: on-demand.

## Page Structure

- Homepage `https://www.techmeme.com/` (HTTP 200, ~399KB). H2 sections in order: `Top News | Sponsor Posts | Featured Podcasts | Newest | From Mediagazer | Upcoming Tech Events | More News | Earlier Picks`. Only Top News / More News / Earlier Picks carry stories.
- **Top News** stories live inside `<DIV CLASS="clus">` clusters (1-3 `itc1` items; extras are same-event secondary reports inside a `<DIV CLASS="relitems">`). **More News / Earlier Picks** are bare `itc1` blocks.
- Story = `<DIV CLASS="itc1"> > <DIV CLASS="itc2" ID="{yymmdd}p{N}">`. A `<span id="s0iN" pml="{yymmdd}p{N}" twid=... twurl=... mdurl=... thurl=... bsurl=...>` attribute carrier sits at the top of each `itc2`.
- Title/link: `<STRONG CLASS="L?"><A CLASS="ourh" HREF="url">title</A></STRONG>`; summary is the `&mdash;` text after `</STRONG>` (page-truncated with `…`). Cite: `<CITE>Author / <A HREF="site">Name</A>:</CITE>`; image `<IMG CLASS="ill" SRC="/{yymmdd}/i{N}.jpg">` (relative → prefix `https://www.techmeme.com`).
- Related: visible `<SPAN CLASS="drhed">More:</SPAN>&nbsp;<span class="bls"><A>Source</A>, ...</span>` (source name + URL only). Discussion groups: same `<SPAN CLASS="drhed">X/LinkedIn/Bluesky/Mastodon/Forums:</SPAN>` + `bls` pattern; each wrapped in `<DIV CLASS="dbpt">`.
- Permalink is built from the **pml id** (`https://www.techmeme.com/{pml.slice(0,6)}/p{pml.slice(7)}`), never the page date — the 260815/h1130 snapshot's first story has pml `260814p32`.
- Historical snapshots: `https://www.techmeme.com/{yymmdd}/h{HHMM}`. The site's own date form defaults to **h2000**; h2000 exists for past dates back to 2006 but 404s on today before 20:00 ET. Fallbacks `h1130` → `h0000`. Snapshots replace the Newest H2 with "About This Page".

## Environment Dependencies

- No login, no browser, no API key; all pages are anonymous HTTP 200 with a standard Chrome User-Agent.
- Polite pacing: random 200-700ms sleep before every request. Techmeme measured unlimited (58 requests, 0 blocks), but the sleep keeps the command conservative.
- Node runtime: uses global `fetch` + `AbortController` (Node 18+). No third-party modules.

## Failure Signals

- `/{yymmdd}/` (directory URL) → **403** — never construct it.
- `/{yymmdd}/h{HHMM}` for a non-aligned minute → 404 (no server-side redirect). The command only uses h2000/h1130/h0000.
- A `--date` with h2000/h1130/h0000 all 404 → `NOT_FOUND` (no snapshot that day).
- Zero `itc1` stories parsed from a 200 page → `API_ERROR` (structure changed).
- `403`/`429` → `RATE_LIMITED`. 5xx / network failure → `API_ERROR` / `NETWORK_ERROR`.
- Individual story `image`/`summary`/one `social_posts` attribute may be absent — the parser tolerates nulls and never drops the item.

## Repair Clues

- If Techmeme changes the container markup, re-derive selectors from a fresh homepage fetch. The `itc1` block regex relies on `<DIV CLASS="itc1"` + pml span + `ourh` title link; the section map relies on `<H2>` boundaries.
- If a new discussion group key appears beyond X/LinkedIn/Bluesky/Mastodon/Forums, decide whether to add it to `discussions` in `parseStory` + the manifest description (the contract currently fixes exactly 5 keys).
- If the h2000 fallback behaviour changes, re-test the snapshot chain against a few dates (past + today) exactly as the explore trace did.
