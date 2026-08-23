# Context

## Precipitation Background (Why This Command Exists)

HN's `jobs` navigation is a distinct read-only feed for YC startup job postings. The command was requested to complement the existing HN `get-new`, `get-past`, and `get-top` views while preserving the jobs page's own rank and cursor pagination.

## Value Assessment

This path is reusable for recurring job monitoring without manually opening HN. Browser capture is preferred over Firebase `jobstories` alone because the API currently exposes the first-page IDs but omits older jobs reached through the page's `More` cursor.

## Page Structure

Start at `https://news.ycombinator.com/jobs`. Listings are `tr.athing.submission`; use the row `id`, `.rank`, `.titleline > a`, and the following row's `.age[title]`/item link. The page has 30 rows and an `a.morelink` such as `jobs?next=48656219&n=31`; follow that absolute URL for subsequent pages. Firebase item metadata is available at `https://hacker-news.firebaseio.com/v0/item/<id>.json`.

## Environment Dependencies

Requires Chrome or Edge with remote debugging enabled; no login or API key. The command uses one attached page and low, bounded concurrency (six Firebase detail requests) to limit request pressure. Browser page-side cross-origin `fetch()` is not usable for Firebase, so the implementation performs Node-side requests from the browser daemon while using the attached page for HN navigation and DOM extraction.

## Failure Signals

Missing `html[op="jobs"]`, listing rows, rank/id/title fields, a jobs-scoped `More` link, or a Firebase `type:"job"` record maps to `DRIFT_DETECTED`. HTTP 429 maps to `RATE_LIMITED`; other non-success responses map to `API_ERROR`; request timeouts map to `NETWORK_ERROR`; no rows/maps to `EMPTY_RESULT`; invalid limits map to `INVALID_PARAM`. Runner-level browser attach errors remain `BROWSER_ATTACH_REQUIRED`.

## Repair Clues

If the CSS classes change, re-explore `/jobs` and update the row/More selectors together. Keep HN page order as the source of rank. Do not replace the page cursor with `jobstories.json` unless HN changes its pagination semantics; the API is currently incomplete for older pages. If Firebase item navigation changes, retain the page-only fields as a fallback only after confirming the new response shape and updating evidence.
