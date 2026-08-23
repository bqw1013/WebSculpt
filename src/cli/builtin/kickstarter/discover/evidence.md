# Evidence: kickstarter/discover

This document records the research and validation evidence for the `kickstarter/discover` command.

## Exploration Path



- Command library check: only `kickstarter/search` exists in the same domain (browser runtime; sort/time values are outdated, `limit` max 20, lacks category/state/staff_picks filters). It is the legacy form this command replaces. No overlap conflict.
- All assumptions were re-verified first-hand in the browser on 2026-08-20.
- Runtime decision (decisive): a plain Node HTTP client is served an interactive challenge page on all kickstarter hosts (verified 5/5 in list-categories); a browser in-page same-origin fetch to `/discover/advanced.json` returns 200 real JSON. Runtime = **browser**.
- Browser attach via `@playwright/cli` succeeded on 2026-08-20; all verification below was performed in-page on a real Chrome session.

## Verified URLs

- https://www.kickstarter.com/ — homepage; real HTML (title "Kickstarter", body ~1.5MB); `<meta name="csrf-token" content="...">` present; `_ksr_session` cookie set by same-origin navigation. In-page `fetch('/discover/advanced.json')` from here returns 200 JSON.
- https://www.kickstarter.com/discover/advanced.json — the core endpoint, fetched in-page with `{ credentials: 'include' }`. HTTP 200, `Content-Type: application/json; charset=utf-8`, ~86.7KB for 12 projects. Response keys: `{ projects, total_hits, ref_tag, aggregations, seed, search_url, has_more }`. No csrf-token header needed; no explicit Referer needed.
- https://www.kickstarter.com/graph — POST `rootCategories` GraphQL query (requires `X-CSRF-Token` + `Referer` headers, `_ksr_session` cookie). Returns 15 top-level categories with base64 ids (`Q2F0ZWdvcnktMTY=` = `Category-16`) whose numeric part matches discover's `category_id` exactly (technology=16, wearables=341, hardware=52, camera equipment=333, gadgets=337, flight=336, 3d printing=331).
- https://www.kickstarter.com/discover/advanced?term=3d+printer — rendered discover page; 302-redirects to the canonical URL exposing site defaults `sort=magic&agg_fields=state,category_id&state[]=upcoming&state[]=live&state[]=late_pledge`; renders 24 project cards in DOM (fallback path only; lower fidelity than the JSON endpoint).

## Structural Evidence

### Endpoint and parameters (all verified in-page, 2026-08-20)

`GET /discover/advanced.json` with same-origin fetch (`credentials: 'include'`):

| Param | Verified behavior |
|---|---|
| `term` | search keyword. `term=3d+printer` -> total_hits 4484, first project "Kare 3d- Desktop Metal 3D Printer". |
| `category_id` | numeric category OR subcategory id. `category_id=16` (Technology) -> 58747 hits; `category_id=341` (wearables subcat) -> 2821 hits; `category_id=52` (hardware) -> 8191 hits. Slug form `category=` is IGNORED. |
| `sort` | `magic` (default), `popularity`, `newest`, `end_date`, `most_funded`, `most_backed`. Each verified to change ordering (e.g. most_backed first = Exploding Kittens 219382 backers; newest first launched 2026-08). Invalid value silently ignored -> command must validate enum. |
| `state` | single value OR array `state[]=a&state[]=b`. `upcoming`(prelaunch, state=submitted, 11168), `live`(2680), `successful`(296415), `late_pledge`(post-campaign, is_in_post_campaign_pledging_phase=true, 4746). Array combines: `state[]=live&state[]=successful` total = 299095 = 2680+296415 exactly. Site default browsing set = upcoming+live+late_pledge. |
| `staff_picks` | `staff_picks=true` -> 73972 hits (subset of all). |
| `per_page` | honored up to 48 (47->47, 48->48, 49/50/60/100 -> 48). `limit` param is IGNORED (always returns 12). |
| `page` | pagination page. `page=2` returns a different page of results (with or without `seed`). |
| `seed` | server-returned opaque token; optional to pass back. |
| `agg_fields` | `agg_fields=state,category_id` populates `aggregations` with `{ categories: [{key, doc_count, id}], state: [...] }`; omitted -> `aggregations` is `{}`. |
| `has_more` | false when result stream is exhausted (e.g. `state=live&category_id=341&per_page=48` -> total 31, returns 31, has_more false). |

### Project object fields (43 keys, from `projects[0]`)

`id, photo{key,full,ed}, friends, is_starred, is_backing, permissions, urls{api,web}, name, blurb, goal, pledged, state, slug, country, country_displayable_name, currency, currency_symbol, currency_trailing_code, deadline, state_changed_at, created_at, launched_at, is_in_post_campaign_pledging_phase, staff_pick, is_starrable, disable_communication, backers_count, static_usd_rate, usd_pledged, converted_pledged_amount, fx_rate, usd_exchange_rate, current_currency, usd_type, creator{id,name,slug,is_registered,is_email_verified,chosen_currency,is_superbacker,avatar{...},urls}, location{id,name,slug,short_name,displayable_name,localized_name,country,state,type,is_root,expanded_country,urls}, category{id,name,analytics_name,slug,position,parent_id,parent_name,color,urls}, video{id,status,hls,high,base,tracks,width,height,frame}, profile{...}, spotlight, percent_funded, is_liked, is_disliked, is_launched, prelaunch_activated`.

Sample project (first hit, `sort=magic`):
```json
{ "id": 2124857724, "name": "Sanctuary: Shattered Sun - RTS PC GAME", "slug": "sanctuary-shattered-sun",
  "url": "https://www.kickstarter.com/projects/enhearten-media/sanctuary-shattered-sun",
  "state": "live", "goal": 143000, "pledged": 1223244, "percent_funded": 855.4153846153847,
  "backers_count": 8825, "currency": "AUD", "deadline": 1787238933, "launched_at": 1784646933,
  "staff_pick": true, "prelaunch_activated": true,
  "creator": { "name": "Enhearten Media", "slug": "enhearten-media", "avatar": "https://i.kickstarter.com/assets/..." },
  "category": { "id": 341, "slug": "technology/wearables", "parent_name": "Technology" },
  "location": { "displayable_name": "Brisbane, AU", "country": "AU", "state": "QLD" } }
```
Note: `category.slug` is `parent/sub` two-level; `category.name` is localized (Chinese locale returned "電玩" for video games).

### Category slug -> numeric id mapping

In-page `POST /graph` body:
```json
{"operationName":"rootCategories","variables":{},"query":"query rootCategories { rootCategories { id name slug subcategories { nodes { id name slug } } } }"}
```
Headers: `Content-Type: application/json`, `X-CSRF-Token` (from `<meta name="csrf-token">`), `Referer: location.href`. Returns 15 top-level categories; `id` is base64 of `Category-<n>`; the numeric `<n>` is exactly what `/discover/advanced.json?category_id=<n>` accepts. Subcategory slug resolution MUST be scoped to its parent category because slugs collide across top levels (e.g. `comedy` exists under film/journalism/music/theater).

## Failure Signals

- Challenge / 403: response body matches the block-page markers or returns HTTP 403. Command should detect on `resp.text()` before `JSON.parse` and throw `PLATFORM_BLOCKED`.
- HTTP 429: rate limit -> `RATE_LIMITED`.
- Invalid `category_id` (e.g. 999999) or invalid `sort`: silently ignored by server (200, unfiltered results) -> command MUST validate its own enum/id inputs.
- Login wall / CAPTCHA DOM markers: regex `验证码|captcha|geetest|滑块.*验证|请完成安全验证` -> `PLATFORM_BLOCKED`.
- NOT_FOUND style checks (none for discover) would precede platform-block detection.
- Fallback path: if in-page fetch is ever challenged, `page.goto('/discover/advanced?...')` renders cards; extract from `a[href*="/projects/"]` (lower fidelity) — recorded as backup only.
- Observed rate limit: ~20 consecutive in-page fetches at 0.3-1s intervals all returned 200 with no 429/403. Limits are lenient.

## Capture Assessment

Capture as a browser command. The path is fully verified first-hand: in-page same-origin fetch to `/discover/advanced.json` is not blocked by Cloudflare when run in a real browser session (unlike node), returning 200 JSON with 43 fields per project (richer than the rendered DOM cards), and all filter/pagination params were cross-validated against real data. Parameterized as `kickstarter/discover` covering browse (category/subcategory) + search (term) + state/sort/staff_picks filters with internal pagination up to `limit` (max 100, per-page cap 48) and `partial:true` on stream exhaustion. The category slug->id mapping via a single in-page `/graph` call is validated. No login required.
