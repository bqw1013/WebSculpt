# Context

## Precipitation Background (Why This Command Exists)

Kickstarter has a single content entry point — the Discover page (`/discover/advanced`). Both the search box and the category menu land on the same page/backend. The legacy `kickstarter/search` command had outdated sort values, a fictitious `time` param, `limit` capped at 20, and no category/state/staff_picks filters. This command replaces it as the sole browse+search entry, with state/sort/staff_picks/category filters and internal pagination up to `limit` (max 100). Precipitated 2026-08-20 after first-hand browser verification.

## Value Assessment

High reuse value: it is the single front door to all Kickstarter project discovery. Users can chain results into `kickstarter/get-project` (via `url`) and `kickstarter/get-creator` (via `creator.slug`). The category slug source is `kickstarter/list-categories`. Browser runtime is mandatory — node(OpenSSL) is Cloudflare-challenged on all kickstarter hosts.

## Page Structure

- Homepage: `https://www.kickstarter.com/` — sets `_ksr_session` cookie; `<meta name="csrf-token">` present; used purely as the same-origin anchor for in-page fetch.
- Core endpoint: in-page `fetch('/discover/advanced.json?...', { credentials: 'include' })`. Response: `{ projects[], total_hits, ref_tag, aggregations, seed, search_url, has_more }`. Each project has 43 fields (id, name, blurb, slug, urls.web.project, photo.full, state, goal, pledged, percent_funded, backers_count, currency, deadline, launched_at, staff_pick, prelaunch_activated, creator{name,slug,avatar}, category{id,slug,parent_name}, location{displayable_name,country,state}, ...).
- Params (real names, verified): `term`, `category_id` (numeric, top-level OR subcategory id; slug `category=` is IGNORED), `sort` (magic/popularity/newest/end_date/most_funded/most_backed), `state[]=` array or `state=`, `staff_picks=true`, `per_page` (honored up to 48; `limit` is IGNORED), `page`, optional `seed`, `agg_fields` (optional, populates aggregations facets).
- Category resolution: in-page `POST /graph` `rootCategories` returns `{ id: "Category-16", name, slug, subcategories { nodes { id: "Category-331", name, slug } } }`; the `id` is base64 of `Category-<n>` (decode with `atob`, pad to %4). Numeric part == `category_id`. Slugs collide across top levels (e.g. `comedy`), so subcategory resolution is scoped to the parent category.
- IMPORTANT (not a bug): the backend's `category_id` filter is relevance/related-category based, NOT a strict whitelist. `category_id=331` ("3d printing") returns mostly 3d printing plus a share of adjacent categories (games/tabletop STL minis, design, diy electronics...). The site's own category pages (`/discover/categories/technology/3d%20printing?category_id[]=331...`) show the identical mix, so the command reproduces site behavior faithfully. Array form `category_id[]=331` is equivalent to scalar `category_id=331` (verified identical totals/breakdown). Do NOT "fix" this by client-side whitelisting — it would diverge from the site.
- Fallback (if in-page fetch ever challenged): `page.goto('/discover/advanced?...')` renders cards in DOM (`a[href*="/projects/"]`); lower fidelity, recorded as backup only.

## Environment Dependencies

- Browser runtime via WebSculpt daemon `connectOverCDP` to user's Chrome (remote debugging enabled). The daemon creates a fresh page each run; command must `page.goto` the homepage first to establish same-origin context.
- No login required; anonymous `_ksr_session` cookie is sufficient.
- Polite pacing: endpoint is lenient (~20 rapid in-page fetches all 200, no 429). Keep per-run requests low (1 page usually, +1 for /graph when category used). Random sleep not required at these volumes but keep frequency modest.
- `X-CSRF-Token` header is required ONLY for `/graph` (homepage meta token), not for `advanced.json`.

## Failure Signals

- Homepage goto lands off-kickstarter, or body matches `Just a moment|cf_chl_opt|challenges.cloudflare.com` -> `PLATFORM_BLOCKED`.
- Fetch body matches CF challenge regex or HTTP != 200 -> `PLATFORM_BLOCKED`; HTTP 429 -> `RATE_LIMITED`.
- Response not parseable JSON or `/graph` returns `errors` -> `DRIFT_DETECTED`.
- Invalid `sort`/`state`/`category`/`subcategory`/`limit` -> server silently ignores; command validates its own enums -> `INVALID_PARAM`.
- `has_more:false` with fewer than requested projects -> `partial: true` in output (not an error).

## Repair Clues

- If project JSON field names change, update `projectToOutput`; the raw response keeps `projects` + `total_hits` + `has_more` + `seed` as anchors.
- If `/graph` rootCategories breaks, fall back to hardcoding the 15 top-level slug->id map (base64 `Category-<n>`) and subcategory maps, or parse `aggregations.categories` (via `agg_fields=state,category_id`) for ids.
- If the JSON endpoint starts being challenged, switch to `page.goto('/discover/advanced?' + query)` and extract cards from `a[href*="/projects/"]` (documented lower-fidelity fallback).
- Same-site shared context: parallel kickstarter commands (get-project/get-creator/list-categories) use the same browser session — keep request frequency low to avoid tripping Cloudflare.
