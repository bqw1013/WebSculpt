# Context

## Precipitation Background

Instagram search is a two-channel feature. `type=media` loads the first-party
keyword search page (`/explore/search/keyword/?q=`), which fires a Relay
GraphQL response; `type=accounts` calls the search-box suggestion API
(`/web/search/topsearch/?query=`) directly from the page context. Both require
a logged-in session.

## Value Assessment

Media search is fully parameterized with serial cursor pagination and keeps
native `XDTMediaDict` payloads. Account search is a lightweight top-5
suggestion lookup that answers "who is this account" without loading profile
pages. Neither path opens detail pages or performs fan-out requests.

## Page Structure

### media (GraphQL)

- Search URL: `https://www.instagram.com/explore/search/keyword/?q=<query>`
- Hashtag redirect: `https://www.instagram.com/explore/tags/{tag}/` 301 →
  `/explore/search/keyword/?q=%23{tag}`
- API: `POST https://www.instagram.com/api/graphql`
- Friendly name: `PolarisKeywordSearchExplorePageRelayQuery`
- **doc_id is volatile**: it changed to `37324993597144881` (2026-08-16), the
  earlier `27384800401152681` is stale. The command does NOT hardcode it — it
  matches the response by `x-fb-friendly-name` header and reuses the captured
  request body for pagination, so a doc_id change is transparent.
- Response path: `data.xdt_fbsearch__top_serp_graphql.edges[].node.items[]`
  (`XDTTopSerpMediaGridUnit` wraps `XDTMediaDict`; ~24 items on the first page)
- Pagination: `page_info.has_next_page` / `page_info.end_cursor`; send the
  captured request body again with `variables.after` set to the cursor.

### accounts (topsearch)

- API: `GET https://www.instagram.com/web/search/topsearch/?query=<query>`
  (page-context fetch with `credentials: "include"`; requires an
  instagram.com origin page)
- Response: `{ users[], places[], hashtags[], has_more, rank_token, ... }`
- `users[]` entries wrap `user` objects with
  `username, full_name, is_verified, is_private, profile_pic_url, pk/id,
  social_context, search_social_context`.
- **No numeric follower count**: follower count is localized text in
  `social_context` (e.g. `"649 万 位粉丝"`,
  `search_social_context_snippet_type: "typeahead_follow_count"`).
- **No pagination**: `users` is a fixed top-5 list; `count=30`, `max_id`, and
  `rank_token` do not return more. `has_more` stays true but is not actionable
  from this endpoint. Limit > returned rows is reported as `partial=true`.
- Alternative full-account endpoints are not available on web:
  `/api/v1/web/account_search/` → 404, `/api/v1/users/search/` → 400
  `useragent mismatch` (mobile-only).

## Environment Dependencies

Browser runtime uses an existing logged-in Instagram session. Media mode waits
for the first-party Relay response, serializes pagination with 0.5-1s
randomized waits, and never opens detail pages. Accounts mode navigates to the
Instagram homepage to establish an instagram.com origin, then fetches
topsearch once. A DOM fallback re-navigates the media search URL and only
returns partial records when visible `/p/` or `/reel/` links exist.

## Failure Signals

Missing GraphQL envelope, non-OK API responses, expired session tokens, an
empty DOM fallback, or a topsearch schema/network failure lead to
`DRIFT_DETECTED`. Login walls, CAPTCHA, 403, and 429 are not bypassed.

## Repair Clues

Re-explore the current `PolarisKeywordSearchExplorePageRelayQuery` friendly
name and response path if Instagram changes its Relay schema; the doc_id is
volatile so never hardcode it. For accounts, re-check the topsearch response
shape if the search-box suggestion API changes. Keep the captured request body
and cursor variable strategy aligned with the current page.
