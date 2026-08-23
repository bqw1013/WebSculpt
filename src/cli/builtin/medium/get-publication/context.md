# Context

## Precipitation Background (Why This Command Exists)

Captured 2026-08-06 as part of the Medium command family plan. A large share of quality Medium content lives in Publications (multi-author magazines), and the existing medium command family (search, get-staff-picks, get-tag-trending, get-article, list-topics) had no way to pull a publication's metadata or article stream. Explore was assessed as passed; raw GraphQL samples (`gql-all-request-body.json`, `gql-all-scroll.json`) were captured.

## Value Assessment

High reuse: content monitoring, topic research, and as a discovery front-end for `medium/get-article` (article `url`) and `medium/get-author` (`author.username`). Direct GraphQL pagination replaces slow DOM scroll-scraping: a 100-item `section=all` run is 1-2 API calls instead of ~10 scroll round-trips, and yields richer fields (absolute dates, clap/response counts) than DOM cards.

## Page Structure

- Entry: `https://medium.com/<slug>` (301-follows to custom domains like betterprogramming.pub). `/<slug>/all` = chronological stream; `/<slug>/latest` redirects to `/all`.
- All data comes from `POST <origin>/_/graphql` executed in page context (relative path, works on custom domains). Body is an array of `{operationName, variables, query}`; the server accepts ad-hoc queries — no persisted-query allowlist (verified).
- Metadata: `publicationByRef(ref:{slug, domain:null})` → name/tagline/description/followGraph.followerCount/avatar/navigationItems. `ref` also accepts `{slug:null, domain:<host>}`.
- Stream: `publicationPostsConnection(first, after, orderBy:{publishedAt:DESC}, filter:{published:true})` (the site's own `PublicationContentDataQuery` shape). `after:""` = first page; loop on `pageInfo.hasNextPage`/`endCursor`. Server may return fewer edges than `first` (100→98 verified), hence `first = remaining + 5` per page.
- Home curation: `window.__APOLLO_STATE__["PublicationPage:homepage"].sections` → `PublicationPostsSection:<pubId>-homepage-<N>` nodes (`title`, `layout`, `posts:[{__ref:"Post:<id>"}]`). Apollo post nodes are stubs; enrich with `post(id: ID!)`, batched 25 operations per POST (variable type must be `ID!`, not `String!`).

## Environment Dependencies

- Browser runtime: daemon attaches to user Chrome/Edge via CDP; no login needed (all queries verified on a logged-in browser but the endpoints are public; member-only posts just return `isLocked: true`).
- Polite pacing is built in (random short waits, small mouse move, gentle scroll, 200-600ms between API pages); ~20 exploration calls triggered no CAPTCHA/403/429.

## Failure Signals

- Unknown/moved slug → GraphQL `publication: null` and/or page text "PAGE NOT FOUND" → `NOT_FOUND`. Checked before any content wait.
- GraphQL `errors` array (e.g. wrong variable type) or missing `publicationPostsConnection` → `DRIFT_DETECTED`.
- Homepage with no sections/posts → `EMPTY_RESULT`.
- If Medium switches to persisted-only queries, every call will fail at once with GraphQL errors → repair by copying the exact query document from a live scroll request (see Repair Clues).

## Repair Clues

- If the custom ad-hoc queries stop working: attach playwright-cli, open `https://medium.com/<slug>/all`, clear the network list, scroll once, then inspect the `POST /_/graphql` request body (`request-body <index>`) — the site sends the full `PublicationContentDataQuery` document including fragments; paste that document verbatim into `STREAM_QUERY`. A captured sample of the request body is available for reference.
- If the homepage stops exposing `__APOLLO_STATE__` sections, fallback: parse `article[data-testid="post-preview"]` cards (title/subtitle/author/relative date only) after scrolling, or derive home order from `publicationPostsConnection` pinned/listedAt ordering.
- If `post(id:)` batching breaks, fall back to one operation per request (slower) or drop home enrichment to DOM-card fields.
