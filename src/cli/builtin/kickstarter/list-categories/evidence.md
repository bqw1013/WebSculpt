# Evidence: kickstarter/list-categories

This document records the research and validation evidence for the `kickstarter/list-categories` command.

## Exploration Path

Command library check: `websculpt command list kickstarter` returns only `kickstarter/search` (browser runtime, no login, built-in Cloudflare/block detection). No category-tree/list-categories command exists, so this is a new command.

Explore workspace `kickstarter-list-categories` was assessed with `status: passed` (2026-08-20) and the user confirmed the contract, including the browser runtime decision.

Decisive runtime finding: a plain Node HTTP client (`node:https` and global `fetch`) is consistently rejected by an interactive challenge page (403 "Just a moment...") against every Kickstarter host (`www.kickstarter.com`, `api.kickstarter.com`, apex, `/v1/categories.json`), 5/5 retries. WebSculpt has no curl runtime (node runtime executes Node code only; shell runtime is a non-executable placeholder). Therefore the command must use the browser runtime, where an in-page `fetch('/graph')` reuses the browser session (cookies + passing page checks).

## Verified URLs

- `https://www.kickstarter.com/` — `curl GET` returns HTTP 200 real HTML (795 KB, `<title>Kickstarter</title>`), containing `<meta name="csrf-token" content="...">` and `Set-Cookie: _ksr_session=...`. Node `https`/`fetch` return HTTP 403 Cloudflare challenge. Verified 2026-08-20.
- `https://www.kickstarter.com/graph` — `curl POST` with `X-CSRF-Token` + `_ksr_session` cookie returns HTTP 200 `application/json` with the full category tree via the `rootCategories` GraphQL query. 6/6 consecutive calls (0.3 s apart) returned 200 with no 429. Verified 2026-08-20.
- `https://api.kickstarter.com`, `https://kickstarter.com`, `https://www.kickstarter.com/v1/categories.json` — all rejected by the Cloudflare challenge from Node, ruling out a node-friendly alternate host.

## Structural Evidence

- GraphQL endpoint: `POST https://www.kickstarter.com/graph`.
- Required headers: `Content-Type: application/json` and `X-CSRF-Token: <token from <meta name="csrf-token">>`. The `_ksr_session` cookie is required (a request with only the token returns 403, and a request with only the cookie returns 403). `Referer` is NOT required (a request without it returns 200).
- Query body:
  ```json
  {"operationName":"rootCategories","variables":{},"query":"query rootCategories { rootCategories { id name slug subcategories { nodes { id name slug } } } }"}
  ```
- Response shape: `{ "data": { "rootCategories": [ { "id", "name", "slug", "subcategories": { "nodes": [ { "id", "name", "slug" } ] } } ] } }`.
- First attempt used invalid fields (`position`, `is_parent`, `parent` on `Category`; `id`/`name`/`slug` directly on the subcategories connection). The server returned field-level GraphQL errors (`Field 'position' doesn't exist on type 'Category'`) rather than rejecting the whole request — a per-field error pattern. Correct structure confirmed: `subcategories` is a connection requiring `nodes`.
- Data: 15 top-level categories and 159 subcategories total. Slug examples: top-level `art`, `technology`, `film & video` (note the space and `&`); subcategory slugs contain spaces, e.g. `3d printing`, `graphic novels`, `conceptual art`.
- In the browser command, the flow is: `page.goto('https://www.kickstarter.com/')` → read `<meta name="csrf-token">` → `page.evaluate(() => fetch('/graph', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(rootCategoriesQuery) }).then(r => r.json()))` — the same-origin fetch carries `_ksr_session` automatically.

## Failure Signals

- Cloudflare managed challenge in the browser (body/title contains "Just a moment...", `cf_chl_opt`, or `challenges.cloudflare.com`) → `PLATFORM_BLOCKED`.
- HTTP 429 → `RATE_LIMITED`.
- GraphQL field errors or a response without `data.rootCategories` → structure drift → `DRIFT_DETECTED`.
- Missing `X-CSRF-Token` (meta absent on a redirect/error page) → treated as blocked/drift; the command should not fabricate data.
- No login required; anonymous page grants the token and session cookie.

## Capture Assessment

Capture as a new browser-runtime command. The `/graph` endpoint and full category tree (15 top-level + 159 subcategories) are verified first-hand over HTTP; Node is blocked by Cloudflare's TLS fingerprint challenge, so the executable command must run in the browser where an in-page `fetch('/graph')` hits the identical verified endpoint with the browser's session cookies. The optional `--parent` filter is a client-side slice of the verified tree. This command is the value source for `kickstarter/discover`'s `category`/`subcategory` parameters.
