# Context

## Precipitation Background (Why This Command Exists)

The installed `vimeo/search` command (browser runtime) intercepted the anonymous `api.vimeo.com/search` responses the search page fired, but its `sort`/`time` params were validated then dropped into `ignoredParams` — "passed but ignored" placeholders. This capture reworks it into a node-runtime command that calls the API directly with real sort/time support, removing the placeholder behavior per the explore contract.

## Value Assessment

- Vimeo is a major public video platform; search is its primary discovery entry.
- One command covers five result types (video/ondemand/people/channel/group) matching the on-site tabs.
- No login/browser required after the rework; a direct API path is lighter and faster than a browser-intercept path.
- Reuse frequency is high for content-discovery workflows.

## Page Structure

- API endpoint: `https://api.vimeo.com/search?` — GET with `filter_type` (`clip`/`ondemand`/`people`/`channel`/`group`), `query`, `page`, `per_page`, `facets=type`, `precision=0`, `fuzzy=true`, `fields` (per-type native keys), optional `sort`+`direction`, optional `filter_uploaded`.
- Auth header: `authorization: jwt <JWT>`. Anonymous JWT lives in `<script id="viewer-bootstrap" type="application/json">` on `vimeo.com/watch` (and `/channels/staffpicks`, a public profile page). `/search` HTML returns a 403 challenge page to plain node, so it is NOT a token source.
- Response: `{ total, page, per_page, paging, data:[ { clip|ondemand|people|channel|group: {...} } ], facets, parameters, search_id, stream_id, mature_hidden_count }`.

## Environment Dependencies

- Node runtime, network access to vimeo.com.
- Anonymous only — no login. `authRequired: not-required`.
- Polite pacing: random 200-700ms sleep before every request; 60s per-request timeout with one retry. The `popularity` sort's first (cold-cache) call can take ~30s, so do not lower the timeout.
- Rate limits: `x-actionlimit` 1000/hour, `x-ratelimit` effectively unlimited (verified across ~35 consecutive calls, no 429/403).

## Failure Signals

- `viewer-bootstrap` missing / no `jwt` → `JWT_FETCH_FAILED` (fallback sources tried first).
- API 401 → JWT expired/invalid → refresh JWT and retry once, else `AUTH_REQUIRED`.
- API 400 → invalid sort/filter combination (pre-validated in command, but a drift here signals new API validation rules).
- Non-200 (5xx/429) → `API_ERROR`.
- Response not JSON or `data` not an array → `DRIFT_DETECTED`.
- Empty results → `EMPTY_RESULT`.

## Repair Clues

- If `/watch` stops embedding `viewer-bootstrap`, try `/channels/staffpicks`, `/<user-slug>`, or re-run explore to find a new token source.
- If the API changes sort values per type, update `SORT_OPTIONS` and `SORT_API`; re-verify with the on-page Relevance dropdown.
- If `filter_uploaded` gains support for other types, relax the `time` per-type validation.
- The `fields` strings are per-type; if the API drops or renames a native key, `parseBody`/`identity` will surface it as `DRIFT_DETECTED` or empty native records.
