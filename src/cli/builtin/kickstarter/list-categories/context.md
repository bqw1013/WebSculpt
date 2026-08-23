# Context

## Precipitation Background (Why This Command Exists)

`kickstarter/discover`'s `category`/`subcategory` parameters need valid slugs. During the Kickstarter command family exploration (2026-08-20), the site's `/graph` GraphQL endpoint was verified to return the full category tree via the `rootCategories` query — 15 top-level categories and 159 subcategories. This command surfaces that taxonomy so `discover` (and callers chaining to it) always use valid values.

## Value Assessment

Reusable as the value source for the whole Kickstarter command family: every `discover` call with `--category`/`--subcategory` depends on these slugs. The endpoint is stable (GraphQL schema, not page markup), the payload is tiny (~11.5 KB), and a single in-page request returns the complete tree. Avoids hard-coding or guessing category slugs.

## Page Structure

- Navigate to `https://www.kickstarter.com/` (anonymous homepage) with `waitUntil: domcontentloaded`. A real browser passes Cloudflare; the page embeds `<meta name="csrf-token" content="...">` and sets the `_ksr_session` cookie.
- Extract the token, then in the page context `fetch('/graph', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ operationName: 'rootCategories', variables: {}, query: 'query rootCategories { rootCategories { id name slug subcategories { nodes { id name slug } } } }' }) })`. The same-origin fetch automatically sends `_ksr_session`.
- Response: `{ data: { rootCategories: [ { id, name, slug, subcategories: { nodes: [ { id, name, slug } ] } } ] } }`. Both the token and the session cookie are required (each alone returns 403); `Referer` is optional.
- The `--parent` filter is a client-side slice of the full tree.

## Environment Dependencies

Browser runtime — the daemon attaches to the user's Chrome/Edge. No login required (anonymous homepage grants the token + session cookie). Cloudflare may occasionally present a managed challenge; the command surfaces it as `PLATFORM_BLOCKED` rather than bypassing it. Node must not be used: Cloudflare rejects Node's TLS fingerprint on every Kickstarter host (verified in explore).

## Failure Signals

- Cloudflare challenge text (`Just a moment...`, `cf_chl_opt`, `challenges.cloudflare.com`, `security verification`, `正在进行安全验证`) in the page or `/graph` response → `PLATFORM_BLOCKED`.
- HTTP 429 → `RATE_LIMITED`.
- Missing csrf-token meta on a reachable page → `DRIFT_DETECTED` (structure change or a redirect/error page).
- `/graph` returning non-JSON or a body without `data.rootCategories` → `API_ERROR` / `DRIFT_DETECTED`.
- An unknown `--parent` slug → `INVALID_PARAM`.

## Repair Clues

- If the csrf-token meta moves or the page becomes a SPA shell, read the token from the network layer instead: intercept the initial response, or fetch the homepage HTML from the page context and regex the `name="csrf-token"` meta.
- If `/graph` changes its schema (e.g., subcategories no longer a `nodes` connection), re-run explore with a fresh `rootCategories` query against `https://www.kickstarter.com/graph` (curl with the session cookie works) and update `GRAPH_QUERY` and the mapping.
- If Cloudflare starts challenging the real browser consistently, the command already reports `PLATFORM_BLOCKED`; do not attempt to bypass verification.
