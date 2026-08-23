# Evidence: instagram/search

## Exploration Path

`websculpt explore assess instagram-search` passed (a prior explore workspace,
trace.md audited). Playwright CLI 0.1.13 attached to the user's logged-in Chrome
via dedicated session `<session>`; a new tab was created and used for Instagram,
other tabs were not touched. Evidence recorded in trace.md under `Tool Trace`
(2026-08-16).

## Verified URLs

* `https://www.instagram.com/explore/search/keyword/?q=ai` (media grid, GraphQL 200)
* `https://www.instagram.com/explore/tags/ai/` (301 → `/explore/search/keyword/?q=%23ai`)
* `https://www.instagram.com/web/search/topsearch/?query=openai` (topsearch 200)
* `https://www.instagram.com/web/search/topsearch/?query=ai` (same, users fixed at 5)
* `https://www.instagram.com/web/search/topsearch/?query=nike` / `travel` / `instagram`
* `https://www.instagram.com/api/graphql`

## Structural Evidence

**media (GraphQL):** `/explore/search/keyword/?q=ai` fires `POST /api/graphql`
with `x-fb-friendly-name: PolarisKeywordSearchExplorePageRelayQuery` → 200.
Response path `data.xdt_fbsearch__top_serp_graphql.edges[].node.items[]`
yields native `XDTMediaDict` objects (`pk`, `id`, `code`, `media_type`, `user`,
`taken_at`, `image_versions2`, `video_versions`, `caption`, `like_count`,
`comment_count`, `view_count`); first page has 24 records. `page_info` has
`has_next_page` and `end_cursor`; reusing the captured request body with
`variables.after=end_cursor` returns another page of 24 (verified via the
same in-page `/api/graphql` fetch the command uses). **doc_id is volatile**:
current request used `doc_id=37324993597144881` (older `27384800401152681`
stale); the command matches by friendly-name header and reuses the captured
postData, so it is doc_id-agnostic. Hashtag page `/explore/tags/ai/` 301s to
keyword search `?q=%23ai`. DOM fallback selector
`a[href*="/p/"], a[href*="/reel/"]` matched 8 unique post links.

**accounts (topsearch):** page-context `fetch('/web/search/topsearch/?query=openai', {credentials:'include'})`
→ 200 with `{users[], places[], hashtags[], has_more, rank_token}`. `users[]`
entries wrap `user` objects exposing `username, full_name, is_verified,
is_private, profile_pic_url, pk/id, social_context, search_social_context`.
There is **no numeric follower count** — follower count is localized text in
`social_context` (e.g. `"649 万 位粉丝"`,
`search_social_context_snippet_type: "typeahead_follow_count"`). The list is a
**fixed top-5**: `count=30`, `max_id`+`rank_token` all returned the same 5
users; `has_more` stays true but is not actionable. No web full-account
endpoint exists (`/api/v1/web/account_search/` 404, `/api/v1/users/search/`
400 useragent mismatch).

**Rate limiting:** 6-burst topsearch calls (≈1s apart) all 200 with no
429/checkpoint; 5 spaced calls (random 1.5-3s) all 200; the full session
(~15 API calls plus navigations) triggered no challenge. topsearch latency
0.9-1.6s; media GraphQL ~2.4s.

## Failure Signals

A logged-in session is required (`xdt_viewer.user.id` present); login walls,
CAPTCHA, 403, and 429 are not bypassed. Media mode re-navigates the search URL
before DOM fallback, returns partial records only when `/p/` or `/reel/` links
are visible, and throws `DRIFT_DETECTED` when both GraphQL and DOM paths fail.
Accounts mode throws `DRIFT_DETECTED` when topsearch is non-OK, its schema is
missing, or the fetch fails. `partial=true` signals the requested limit could
not be reached (media stream exhausted or accounts fixed top-5 exceeded).

## Capture Assessment

`instagram/search` is a modification of the existing installed command. It adds
`type=accounts` (topsearch, fixed top-5, `socialContext` localized text, no
numeric follower count), keeps `type=media` (GraphQL + cursor pagination +
DOM fallback, hashtag redirect covered), removes `sort`/`time` (no IG search
functionality — absent from GraphQL variables and the UI), and drops the stale
doc_id constant. Parameters: `query` (required), `type` (media|accounts,
default media), `limit` (1-100, default 20). Both paths stay search-only with
no detail-page fan-out.
