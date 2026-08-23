# Context

## Precipitation Background (Why This Command Exists)

Substack was listed as a planned browser-search platform with a public search page but no command in the library. Exploration verified five search views and their page-owned API endpoints. The command captures that reusable path for keyword searches while retaining a page-level fallback for endpoint or response drift.

## Value Assessment

The path is parameterized by query, result type, limit, and the standard sort/time parameters. API extraction is compact and complete; the DOM fallback preserves basic usability during short-lived API failures or backend changes. The command is browser-bound but does not require a separate API key.

## Page Structure

The public entry page is `https://substack.com/explore`. The global search input is `input[aria-label="Global search"]` with placeholder `Search Substack`. Submitting a query produces `https://substack.com/search/<encoded-query>?searching=<view>`.

Verified API routes:

- `profile/search?query=<q>&page=<n>` for people.
- `recent/search?query=<q>&fromSuggestedSearch=false[&cursor=<token>]` for recent notes/comments.
- `post/search?query=<q>&page=<n>&includePlatformResults=true&filter=all` for posts.
- `publication/search?query=<q>&page=<n>&lastSearch=<timestamp>` for publications.
- `top/search?query=<q>&fromSuggestedSearch=false[&cursor=<token>]` for the mixed Top view.

DOM fallback anchors posts through `main a[href]` URLs containing `/p/`. People/publication cards expose a class prefix `[class*="profileRow-"]`; feed items expose `[class*="feedUnit-"]`. Class suffixes are generated and must not be hard-coded.

## Environment Dependencies

The WebSculpt daemon must attach to an already-open Chrome with remote debugging enabled. The command navigates its injected page to Substack before issuing page-context `fetch`, so browser cookies and session state are reused. Public search worked without a separate login during exploration. Keep request volume bounded by the 100-result limit; do not add parallel page loads or detail-page crawling. The implementation uses a low-risk pacing profile: short randomized waits after navigation, between paginated requests, and before return, plus one best-effort pointer/scroll nudge on the DOM fallback path.

## Failure Signals

Treat a non-2xx API response, invalid JSON, or a missing expected `items`/`results` array as an API failure and enter DOM fallback. Do not fall back for a valid empty array. If the search page has no matching result anchors/cards, throw `DRIFT_DETECTED`. `sort` and `time` are accepted standard parameters but are ignored because no Substack control was verified; non-default requests are surfaced through `ignoredParams`. `BROWSER_ATTACH_REQUIRED` is infrastructure-level and comes from the daemon when Chrome cannot be attached.

## Repair Clues

If API extraction fails, first compare the current browser network request with the five verified route families and their query parameters. If the page still renders results, update only the DOM selectors and field parsing while retaining `source: "dom"`, `fallbackUsed: true`, and `partial: true`. If both API and DOM drift, re-run explore with a new query, record a concrete response/DOM sample, update evidence, then modify the draft and revalidate before finalizing. Never connect to or launch Chrome from command code.
