# Evidence: techmeme/list-events

This document records the research and validation evidence for the `techmeme/list-events` command.

## Exploration Path

Command library overlap check: `websculpt command list techmeme` returned no commands, and `websculpt command domains` listed 36 domains with no `techmeme` entry. This is the first command for the techmeme domain — nothing to reuse, no name conflict.

Runtime consulted: `node`. The page is plain static HTML fetched over HTTPS and parsed in pure Node (no browser automation needed). Reachability was verified first-hand with a default UA, a node UA, and a standard Chrome UA — all returned HTTP 200 with no anti-bot challenge and no login.

Exploration trace verified (assessment status: passed, capture eligible).

## Verified URLs

- `https://www.techmeme.com/events` — primary data source. HTTP 200, 72,895 bytes, single server-rendered page containing 144 event rows covering roughly five months.
- `https://www.techmeme.com/` — homepage. Contains the same `#events` markup under `<H2>Upcoming Tech Events</H2>` with 23 rows (last: AWS re:Invent), a strict subset of the events page.
- `https://www.techmeme.com/r2/www.ces.tech_-Whslh1AN.htm` — one `/r2/` redirect shell. HTTP 200 with `<meta http-equiv="refresh" content="0; URL=https://www.ces.tech/" />`, proving `/r2/` hrefs are Techmeme's internal redirect wrapper (the path encodes the target host), not official direct links.

## Structural Evidence

The events container is `<DIV ID="events">` (uppercase; the case is load-bearing) and closes at the first uppercase `</DIV>`. Event-row divs and the `.efoot` footer divs use lowercase tags, so the case-sensitive close is what stops the container match at the right place.

Every event row is a single line with identical shape:

```html
<div class="nf ne"><div class="rhov"><a href="/r2/<host>_<path>-<hash>.htm"><div>Aug 19-21</div><div>AI Summit Seoul &amp; Expo</div><div>Seoul</div></a></div></div>
```

- The `<a>` has exactly three direct `<div>` children, in order: **date-range / name / location**.
- Outer div class carries the flags. Verified counts on 2026-08-19: `featured` ×1, `featured ne` ×2 (so **featured = 3**), `ne` ×30, `nf ne` ×111 → 144 events + 1 `.efoot` footer (the footer's `fn1/fn2/fn3` divs have no `rhov`, so it never matches the row regex).
- **featured flag**: outer class contains the token `featured`. CSS gives these rows a yellow background (`#events .featured .rhov {background:#ffd}`). Featured name divs carry a sponsor CTA `<span>` (`REGISTER NOW` / `REGISTER FOR FREE`) that must be stripped from the name.
- **Earnings days**: 8 rows, name starts with `Earnings: ` (e.g. `Earnings: NVDA, CRM, HPQ, CRWD`), location div is empty, href is `/r2/finance.yahoo.com_...`.
- **VIRTUAL/HYBRID**: 10 rows (VIRTUAL ×3, HYBRID ×7). The prefix lives inside the name div in an `<em style="color:#800;font-style:italic;font-size:90%">VIRTUAL:</em>` element — it is part of the name, NOT the location. VIRTUAL rows have an empty location; HYBRID rows have a real location.
- Entities to decode in names/locations: `&amp;` → `&`, `&ldquo;` / `&rdquo;` → `"`.
- Dates are raw text like `Aug 16-19`, `Aug 19`, `Aug 30-Sep 7`, `Jan 6-9` (no year on the page; early-year rows refer to the next calendar year).
- `url` is the raw `/r2/...` href. Resolving each row's target needs one request per row (144 extra requests) and adds nothing beyond what the href encodes, so the command returns the href as-is.

## Failure Signals

- `<DIV ID="events">` missing from the HTML → page structure changed → `DRIFT_DETECTED`.
- Container present but the row regex matches zero rows → row markup changed → `DRIFT_DETECTED`.
- Fetch throws (DNS/TLS/timeout) → `NETWORK_ERROR`.
- HTTP 403/429 → `RATE_LIMITED` (verified unthrottled, but the mapping is kept for robustness).
- Any other non-2xx → `API_ERROR`.
- No login, no cookies, no API key — no auth-dependent failure modes.

## Capture Assessment

This command should be captured. Techmeme's events page is the canonical aggregation of upcoming tech events and quarterly earnings days (conferences, launches, demo days) — a signal no existing command in the library covers (the techmeme domain has zero commands). It is cheap and reliable: one static HTML request, no auth, no browser, and Techmeme does not rate-limit (verified: 58 requests including a 20-burst round, all HTTP 200). The node runtime satisfies both selection criteria — effectively unthrottled, and a browser adds no information on this public, non-personalized page.
