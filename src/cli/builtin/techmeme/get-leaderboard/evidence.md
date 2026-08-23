# Evidence: techmeme/get-leaderboard

This document records the research and validation evidence for the `techmeme/get-leaderboard` command.

## Exploration Path

The implementation follows a verified explore path (explore assess: passed, Confirmation filled by user). Command library check: no existing techmeme command, so this is a new command; no conflicts with similar rank-list commands on other platforms (douban get-ranklist, github get-trending). Runtime contract consulted for the node runtime.

All extraction uses plain Node `fetch` / `curl` against static HTML. No browser, no login, no API signing. Techmeme was stress-tested with 58 requests (including 20 back-to-back homepage hits and 3 rounds across endpoints) — all returned HTTP 200, no 429/403/challenge/truncation. Node runtime is appropriate: the API has no rate limit and HTML carries all the information a browser would render.

## Verified URLs

- https://www.techmeme.com/lb (page shell; three sections: General / Sample Topic / Paid Topic)
- https://www.techmeme.com/lbdocs/table__general__Techmeme_Leadership.html (Leadership static table: authors + publications, 50 rows each)
- https://www.techmeme.com/lbdocs/table__general__Techmeme_Presence.html (Presence static table: authors + publications, 50 rows each)
- https://www.techmeme.com/260819/lb (today's historical page; 4 tables inlined server-side, data identical to current static table)
- https://www.techmeme.com/260814/lb , https://www.techmeme.com/260810/lb , https://www.techmeme.com/260805/lb , https://www.techmeme.com/260702/lb , https://www.techmeme.com/220101/lb (historical snapshots, all HTTP 200)
- https://www.techmeme.com/261019/lb , https://www.techmeme.com/999999/lb (future / invalid date → HTTP 404)

## Structural Evidence

### Current board path (`/lbdocs/table__general__Techmeme_{Leadership|Presence}.html`)

- The file is a fragment, not a full page. It contains a `<header id="authors">` section (skip button + `<h2>` title) followed by `<table>` (author rows), then `<header id="publications">` followed by a second `<table>` (publication rows). Only the first (authors) table is used.
- Author row: `<tr><td>N</td><td><a href="https://www.techmeme.com/search/query?q=author%3A...">Author Name</a></td><td><a href="https://twitter.com/handle">@handle</a></td><td>8.450%</td><td>SOURCES_CELL</td></tr>`.
- Twitter cell may be `&nbsp;` → output `twitter: null`. Verified in Presence authors table at rank 6 (Chris Metinko).
- Percentage is a string like `8.450%` (3 decimals) → parse float `8.45`.
- Sources cell, simple format (most rows): `<a href="...">Bloomberg</a>&nbsp;(#1)` → `{name:"Bloomberg", rank:1, percentage:null}`.
- Sources cell, detailed format (multi-source rows; Leadership 2 rows, Presence 1 row in current data): `1.048%:&nbsp;<a href="...">Bloomberg</a>&nbsp;(#1), 0.110%:&nbsp;<a href="...">@jasonschreier.bsky.social</a>` → entries with per-source `percentage`; non-publication entries (Bluesky handle / personal blog, e.g. `@jasonschreier.bsky.social`, `~this week in security~`) have no `(#N)` rank → `rank: null`.
- Mixed format also seen in an older snapshot (2025-01-01): first entry without percentage prefix, later entry with `0.000%:` prefix → both forms must be accepted by the same regex.

### Historical path (`/{yymmdd}/lb`)

- The historical page inlines all 4 tables server-side: `<table id="Leadership_authors">`, `<table id="Leadership_pubs">`, `<table id="Presence_authors">`, `<table id="Presence_pubs">` (plus `id="aLeadership_authors"` etc. `<h3>` headings, which must NOT be confused with the table ids).
- Each author table has 50 rows. Rows 1-10 render normally (rows carry `class="r1"`/`r2`), rows 11-50 carry `style="display:none"` but are present in the HTML — parsing is unaffected.
- Header row is `<tr class="lbh"><td>Rank</td><td>Author</td>...` (uses `<td>`, not `<th>`), so the parser must skip by NaN rank rather than by `<th>` alone.
- The `<table id="{Board}_authors">` row schema is identical to the current-board schema (Rank / Author / Twitter / {Board} / Sources).
- `yymmdd` conversion: `YYYY-MM-DD` → 2-digit year + month + day (e.g. `2026-08-14` → `260814`). Future or non-archived dates return HTTP 404.
- Sample Topic Leaderboards (TikTok / OpenAI) and Paid Topic Leaderboards live at separate `/lbdocs/table__sample__*.html` / `table__paid__*` resources and are excluded from this command.

## Failure Signals

- HTTP 404 on `/{yymmdd}/lb` → date has no snapshot → throw `NOT_FOUND`.
- Non-200 status (403 anti-bot, 5xx) → throw `API_ERROR` / `RATE_LIMITED` (429).
- Fetch rejection (network/DNS/TLS) → throw `NETWORK_ERROR`.
- Authors table not found in HTML (structure drift) → throw `DRIFT_DETECTED`.
- Board not in `leadership|presence` → `INVALID_PARAM`; malformed date string or impossible calendar date → `INVALID_PARAM`; `limit` not a digit string or out of 1-50 → `INVALID_PARAM`.

## Capture Assessment

This command is worth capturing: Techmeme's author leaderboards (Leadership = share of headlines led by the author's reporting; Presence = share of appearances in any covered post) are a stable, publicly accessible ranking that is tedious to scrape ad hoc (table fragment + historical date paths + two source-cell formats). It is reusable for tracking active tech reporters/publications and comparing rank changes over time (rolling 180-day snapshots). No auth, no browser, no rate-limit concern; the path was validated across 8+ URLs including 5 historical dates.
