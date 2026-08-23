# Evidence: techmeme/get-story

This document records the research and validation evidence for the `techmeme/get-story` command.

## Exploration Path

The `techmeme` domain had no existing commands (`websculpt command list techmeme` returned "No commands available"), so this is a brand-new candidate. The explore trace (`techmeme-get-story/trace.md`) was completed and passed `explore assess` on 2026-08-19 (status: passed, captureEligible: true). User reviewed and confirmed the full contract (parameters, output schema, node runtime) on 2026-08-19.

The path uses plain HTTP (Node `fetch`) against Techmeme's anonymous static HTML. No login, no browser, no JS challenge, no signature. Techmeme serves anonymous requests without rate-limiting (repeated home-page hits all returned HTTP 200, no 429/403/challenge), but the command still enforces a random 200-700ms pre-request sleep per project-wide polite pacing policy.

## Verified URLs

- https://www.techmeme.com/
- https://www.techmeme.com/260818/p29
- https://www.techmeme.com/260815/p11
- https://www.techmeme.com/260815/p1
- https://www.techmeme.com/river
- https://www.techmeme.com/260815/p99 (HTTP 404)
- https://www.techmeme.com/260899/p1 (HTTP 404)

## Structural Evidence

A permalink page is the day's snapshot page plus an anchor locating the cluster. `/260818/p29` returns the 08-18 snapshot (41 clusters, all itc2 ids `260818pN`), with the target cluster located by `<A NAME="a260818p29">`. Old stories behave identically (`/260815/p11` -> 08-15 snapshot, 21 clusters). Home page and permalink pages share the exact same cluster structure.

Cluster container:

```
<DIV CLASS="clus">
<A NAME="a260818p29"></A>
<A NAME="a260818p33"></A>            <!-- alias anchors: several may point to one cluster -->
<DIV CLASS="itc1" ...><DIV CLASS="itc2" ID="260818p29"><DIV CLASS="item" ID="0i1">
  <CITE>Author / <A HREF="source_home">Source</A>:</CITE>     <!-- author optional -->
  <span id="s0i1" pml="260818p29" twid="..." twurl="..." mdurl="..." thurl="..." bsurl="..."></span>
  <DIV CLASS="ii"><A HREF="story_url"><IMG CLASS="ill" SRC="/260818/i29.jpg"></A>
    <STRONG CLASS="L5"><A CLASS="ourh" HREF="story_url">Title</A></STRONG>&nbsp; &mdash;&nbsp; Summary&hellip;
  </DIV>
  <DIV ID="0d1">                       <!-- collapsed: SPAN drhed sections -->
    <SPAN CLASS="drhed">More:</SPAN>&nbsp;<span class="bls">...</span>
    <SPAN CLASS="drhed">X:</SPAN>&nbsp;<span class="bls">...</span>
    <SPAN CLASS="drhed">LinkedIn:</SPAN>&nbsp;<span class="bls">...</span>
    <SPAN CLASS="drhed">Bluesky:</SPAN>&nbsp;<span class="bls">...</span>
    <SPAN CLASS="drhed">Mastodon:</SPAN>&nbsp;<span class="bls">...</span>
    <SPAN CLASS="drhed">Forums:</SPAN>&nbsp;<span class="bls">...</span>
  </DIV>
  <DIV ID="0p1" STYLE="display:none">  <!-- expanded: DIV drhed sections, richer -->
    <DIV CLASS="drhed">More:</DIV>
    <DIV CLASS="di"><CITE>Author / <A HREF="src_home">Source</A>:</CITE> &nbsp; <A HREF="article">Title</A></DIV>
    <DIV CLASS="drhed">X:</DIV>
    ...
  </DIV>
</DIV></DIV></DIV>
```

Key structural facts:

- Main report: `<CITE>Author / <A>Source</A>:</CITE>` (author optional; pure source like `Anthropic:` has no author), `ourh` anchor in `ii` gives title + original URL, `ill` image is a relative path needing `https://www.techmeme.com` prefix, text after `&mdash;` is the editor summary. Image may be absent.
- social_posts (Techmeme official posts): `twurl`(X/Twitter), `mdurl`(Mastodon), `bsurl`(Bluesky), `thurl`(Threads) on the main `pml` span. Present on all news clusters.
- related ("More:"): collapsed `span.bls` gives only source name + link; expanded `0p1` `DIV.di` gives author + source + source_home + title + article URL (same links, richer info). Use the expanded state.
- discussions: collapsed `0d1` SPAN drhed blocks grouped by platform: X / LinkedIn / Bluesky / Mastodon / Forums (Hacker News + Reddit). Group combinations vary per cluster (some have only More; some have More+X+Bluesky; Mastodon only in some). Parser must tolerate missing sections.
- Alias clusters: multiple anchors may point to one `itc2` (e.g. `a260818p25`/`a260818p3`/`a260818p26` all point to `itc2 ID="260818p25"`). Requesting `/260818/p3` resolves to cluster p25; the returned permalink must be the canonical id (`260818/p25`). Resolution: anchor locate, then first following `<DIV CLASS="itc2" ID="...">`.
- No timestamps: the entire permalink page (including `<head>` meta, og:title, cluster HTML) contains no story publish time (no AM/PM, no datetime, no published_at). Timestamps only exist on the River page (`12:15 AM` + `<H2>date</H2>`), which only covers ~5 days and needs a second request. `date` is derived from the URL `{yymmdd}` segment (e.g. `260815` -> `2026-08-15`), date only, no time.
- 404 behavior: invalid story id or invalid date returns HTTP 404 plain text.

## Failure Signals

- HTTP 404 -> NOT_FOUND (invalid date or story id).
- Requested anchor absent from a 200 snapshot -> NOT_FOUND.
- Anchor present but no following itc2 cluster / cluster parse failure -> API_ERROR (page drift).
- HTTP 429/403 -> RATE_LIMITED.
- Network failure / timeout -> NETWORK_ERROR.
- URL not matching `/^https?:\/\/www\.techmeme\.com\/\d{6}\/p\d+$/` -> INVALID_PARAM; missing `url` -> MISSING_PARAM.

## Capture Assessment

This command should be captured: Techmeme story clusters are the core unit of its news aggregation, and permalink pages are frozen archives (the only complete record after a story leaves the home page). The extraction path is simple, deterministic, free of login/browser/anti-bot constraints, and verified against live pages. Node runtime is appropriate because Techmeme is anonymous static HTML with no rate limiting and no browser-only information; all fields can be extracted from a single fetch.
