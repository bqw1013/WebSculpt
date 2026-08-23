# Evidence: vimeo/search

This document records the research and validation evidence for the `vimeo/search` command.

## Exploration Path

Explore workspace: `<explore-workspace>` (assess passed 2026-08-18).

Existing command `vimeo/search` was fully read before exploration. It intercepted anonymous `api.vimeo.com/search?` responses in the browser (filter_type distinguishes the 5 types), but its `sort`/`time` params were validated then dropped into `ignoredParams` ("passed but ignored"). This capture reworks the command into a node-runtime implementation with real sort/time mapping.

Node runtime contract consulted.

## Verified URLs

- `https://vimeo.com/search?q=short+film` — browsed via Chrome attach (session `<session>`) to enumerate the Relevance sort dropdown and Filters panel options and hook the resulting API requests.
- `https://api.vimeo.com/search?filter_type=clip&query=short%20film&page=1&per_page=24&sort=latest&direction=desc&facets=type&precision=0&fuzzy=true&fields=clip.name,...` — actual API request captured when clicking "Recently uploaded".
- `https://vimeo.com/watch` — node-reachable (HTTP 200, ~126KB), embeds `<script id="viewer-bootstrap">` with an anonymous JWT (user:null, scope "public", app_id 58479). Source of the API auth token.
- `https://vimeo.com/channels/staffpicks` and `https://vimeo.com/<user-slug>` — also node-reachable and embed viewer-bootstrap JWT (fallback token sources).
- `https://vimeo.com/search` — returns a 403 challenge page to plain node; NOT usable as a JWT source.

## Structural Evidence

API endpoint: `https://api.vimeo.com/search?` (GET, anonymous public JWT).

Required auth header: `authorization: jwt <JWT>` (without it the API returns 401, error_code 8003 "didn't receive user's credentials"). Other headers observed: `accept: application/vnd.vimeo.*+json;version=3.3`, `referer: https://vimeo.com/`, `accept-language: en`, real Chrome `user-agent`.

Request params:
- `filter_type`: `clip` | `ondemand` | `people` | `channel` | `group` (maps from command `type`).
- `query`, `page` (1-based), `per_page` (24), `facets=type`, `precision=0`, `fuzzy=true`.
- `fields`: per-type native keys — verified `data[]` contains `data[0].clip` / `ondemand` / `people` / `channel` / `group`.
- Sort params: `sort` + `direction` (see sort map below).
- Time filter: `filter_uploaded` (see time map below).

Response shape: `{ total, page, per_page, paging:{next,...}, data:[ { <kind>: { name, uri, link, pictures, metadata, ... } } ], facets, parameters, search_id, stream_id, mature_hidden_count }`.

Sort dropdown options (video/ondemand tab) and API mapping, verified by clicking each option and capturing the request:
| UI option | API params |
|---|---|
| Relevance (default) | (no sort param) |
| Recently uploaded | `sort=latest&direction=desc` |
| Most popular | `sort=popularity&direction=desc` |
| Title, A to Z | `sort=alphabetical&direction=asc` |
| Title, Z to A | `sort=alphabetical&direction=desc` |
| Longest | `sort=duration&direction=desc` |
| Shortest | `sort=duration&direction=asc` |

Per-type sort availability (API returns 400 "The sort provided isn't valid for this resource." for invalid combos):
- video / ondemand: relevance, popular, latest, title_asc, title_desc, longest, shortest (7)
- channel / group: relevance, popular, latest, name_asc, name_desc (5)
- people: relevance, popular, name_asc, name_desc (4) — `latest` and `duration` are NOT valid for people

Filters panel "Upload date" options → `filter_uploaded`: Any=absent, Last 24 hours=`today`, Last 7 days=`this-week`, Last 30 days=`this-month`, Last 365 days=`this-year`. `filter_uploaded` is valid for `filter_type=clip` only; people/channel/ondemand return HTTP 400 when it is set.

Rate limits (response headers): `x-actionlimit-limit: 1000` (per hour window, `x-actionlimit-remaining` decrements per call), `x-ratelimit-limit` ≈ 9.2e18 (effectively unlimited). ~35 consecutive node calls returned 200 with no 429/403; the `popularity` sort's first (cold-cache) call took ~30s then subsequent calls ~2.5s.

## Failure Signals

- `viewer-bootstrap` script or `jwt` field missing/empty in `/watch` HTML → JWT_FETCH_FAILED; fallback to `/channels/staffpicks`.
- API 401 → invalid/expired JWT (treat as auth failure; re-fetch JWT and retry once).
- API 400 → invalid sort/filter combination; the command validates combos up front (INVALID_PARAM) to prevent reaching the API.
- API non-200 (5xx/429) → API_ERROR.
- Response body not JSON / `data` not array → DRIFT_DETECTED (schema change).
- Slow cold-cache responses (~30s) and occasional timeouts → 60s per-request timeout plus one retry.
- No records after pagination → EMPTY_RESULT.

## Capture Assessment

This command should be captured as a rework of the installed `vimeo/search`. It was already the command-library entry for Vimeo search, and the exploration verified a stable anonymous-node path (JWT from `/watch` + direct `api.vimeo.com/search`) that satisfies the user's runtime criteria (no rate limiting across consecutive calls; identical information to the browser-intercept path). The rework adds real sort/time support and removes the placeholder `ignoredParams` behavior.
