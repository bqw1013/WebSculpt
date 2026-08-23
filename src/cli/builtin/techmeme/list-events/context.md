# Context

## Precipitation Background (Why This Command Exists)

Techmeme's events page is the de-facto aggregated calendar of the tech industry's upcoming events and quarterly earnings days. The techmeme domain had zero commands in the library, so there was no way to query it. This command turns the static page into a reusable, scriptable list.

## Value Assessment

- Single request returns the full calendar (~144 events / ~5 months) — no pagination needed.
- Includes earnings days (`Earnings: <tickers>`) and featured/sponsored rows, which are the two most decision-relevant signals on the page.
- Reuses the same cheap channel (public static HTML, no auth/browser), and Techmeme shows no rate limiting (verified: 58 requests, all HTTP 200).

## Page Structure

- Primary URL: `https://www.techmeme.com/events` — `<DIV ID="events">` (uppercase) → `<H2>All Tech Events</H2>` → event rows → `<div class="efoot">` → `</DIV>`.
- Row shape (single line): `<div class="nf ne"><div class="rhov"><a href="/r2/<host>_<path>-<hash>.htm"><div>DATE</div><div>NAME</div><div>LOCATION</div></a></div></div>`.
- Outer class tokens: `featured` (sponsored, yellow background via `#events .featured .rhov {background:#ffd}`), `ne` / `nf` (plain site styling — not output).
- Featured names contain a CTA `<span>` (`REGISTER NOW` / `REGISTER FOR FREE`) → strip.
- VIRTUAL/HYBRID prefix is an `<em>` inside the name div → keep the text (`VIRTUAL:` / `HYBRID:`), strip the tag.
- Earnings days: name starts `Earnings: `, location empty, href `/r2/finance.yahoo.com_...`.
- The homepage (`https://www.techmeme.com/`) embeds the same markup under `<H2>Upcoming Tech Events</H2>` with a 23-row strict subset (last: AWS re:Invent) — a cheap fallback if the full page ever breaks.
- `/r2/...` hrefs are Techmeme's redirect shell (`<meta http-equiv="refresh" content="0; URL=https://www.ces.tech/" />`); the path encodes the target host. Returned as-is — resolving requires 1 request per row and adds nothing.

## Environment Dependencies

- Public static HTML — no login, no cookies, no browser, no API key.
- Runtime: `node` (global `fetch`). Techmeme does not WAF-challenge undici's TLS stack (verified: plain fetch returns HTTP 200 with a default UA).
- Polite pacing: random 200-700ms sleep before the request (a single request per invocation, but the delay keeps the command polite for repeated/scripted use).
- Rate limits: none observed — 58 requests (including a 20-burst round) all HTTP 200; the command still maps 403/429 to `RATE_LIMITED` for safety.

## Failure Signals

- `<DIV ID="events">` missing → `DRIFT_DETECTED` (page layout changed).
- Container present, 0 rows matched → `DRIFT_DETECTED` (row markup changed).
- Fetch throws → `NETWORK_ERROR`; HTTP 403/429 → `RATE_LIMITED`; other non-2xx → `API_ERROR`.
- If rows match but fields are empty where they shouldn't be, re-check the `<div>` child order (date / name / location) and the outer class flags.

## Repair Clues

- Fallback entry: parse the homepage's `<DIV ID="events">` (Upcoming Tech Events, 23-row subset) with the same regex.
- If the row markup changes, update the row regex; the three inner `<div>` children order (date / name / location) is the stable contract.
- If `/r2/` is ever replaced by direct links, href extraction stays the same — only the URL prefix may change.
