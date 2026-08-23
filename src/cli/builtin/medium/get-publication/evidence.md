# Evidence: medium/get-publication

This document records the research and validation evidence for the `medium/get-publication` command.

## Exploration Path

- Library check (`websculpt command list medium`, 2026-08-06): existing commands `medium/get-article`, `medium/get-staff-picks`, `medium/get-tag-trending`, `medium/list-topics`, `medium/search` — none covers fetching a publication's metadata + article stream by slug. No overlap; this is a new command.
- Explore trace was assessed as passed. Raw captured GraphQL request/response samples: `gql-all-request-body.json`, `gql-all-scroll.json`.
- Browser exploration was done with `@playwright/cli` attached to the user's Chrome, in a single tab, cleaned up and detached afterwards.
- Key discovery: the publication page's own scroll-loading mechanism is a GraphQL call to `POST <origin>/_/graphql`. The server accepts arbitrary (non-persisted) queries from page context, so the command fetches data directly from this endpoint instead of scraping DOM cards, which carry fewer fields (relative dates only, no clap/response counts).

## Verified URLs

- https://medium.com/grepsr-blog — publication homepage; Apollo sections and DOM cards inspected.
- https://medium.com/grepsr-blog/all — chronological stream; scrolling 10→20 cards triggers `POST /_/graphql` (`PublicationContentDataQuery`).
- https://medium.com/better-programming — 301-redirects to https://betterprogramming.pub/ (custom domain); Apollo sections and GraphQL relative path verified working there.
- https://medium.com/towards-data-science — renders Medium "PAGE NOT FOUND 404"; `publicationByRef` returns null for this slug.
- https://medium.com/_/graphql and https://betterprogramming.pub/_/graphql — GraphQL endpoint, verified via in-page `fetch` with custom queries (HTTP 200).

## Structural Evidence

All facts below were verified live on 2026-08-06.

**Publication metadata** — `query($ref: PublicationRef!) { publication: publicationByRef(ref: $ref) { id name slug tagline description domain followGraph { followerCount } avatar { id } navigationItems { title value destination } } }` with `{ref:{slug:"grepsr-blog",domain:null}}` returns name="Grepsr Blog", tagline, description, `followGraph.followerCount`=56, `avatar.id`="1*H8cPFPXkt1kiImIu3Ynu_w.png" (image URL pattern: `https://miro.medium.com/v2/resize:fit:400/<imageId>`). Also verified for better-programming (224,348 followers), ux-planet (363,278), data-science-collective (944,886). `ref` also accepts `{slug:null, domain:"betterprogramming.pub"}`.

**Chronological stream (section=all)** — operationName `PublicationContentDataQuery` (the exact query the page fires when scrolling `/all`):
`query PublicationContentDataQuery($ref: PublicationRef!, $first: Int!, $after: String!, $orderBy: PublicationPostsOrderBy, $filter: PublicationPostsFilter) { publication: publicationByRef(ref: $ref) { publicationPostsConnection(first: $first, after: $after, orderBy: $orderBy, filter: $filter) { edges { listedAt node { id title mediumUrl readingTime firstPublishedAt latestPublishedAt isLocked clapCount postResponses { count } previewImage { id } extendedPreviewContent { subtitle } creator { id username name imageId } } } pageInfo { endCursor hasNextPage } } } }`
Variables: `{ref:{slug,domain:null}, first:N, after:"", orderBy:{publishedAt:"DESC"}, filter:{published:true}}`.
- `after: ""` returns the first page. The page's native calls use `first: 10`; custom `first: 25` returned 25, `first: 50` returned 50/49, `first: 100` returned 98, `first: 150` returned 146 — responses can contain slightly fewer edges than requested, so pagination must loop on `pageInfo.hasNextPage` + `endCursor` until the limit is met.
- `endCursor` is a JSON string like `{"feed_sort_listed_at##listed_at":{"N":"1667458960936"},"post_id":{"S":"186f9cea4a51"},"publication_id":{"S":"5ce667e721ce"}}`.
- Sample edge node (real data): `{id:"5a8b81c74579", title:"Web Scraping Best Practices for RPA Integration", mediumUrl:"https://medium.com/grepsr-blog/web-scraping-best-practices-for-rpa-integration-5a8b81c74579", readingTime:4.25, firstPublishedAt:1785750527102, latestPublishedAt:1785750527102, isLocked:false, clapCount:0, postResponses:{count:0}, previewImage:{id:"0*BZRFhW5lE3iZWdo9.jpg"}, extendedPreviewContent:{subtitle:"The new era of RPA-..."}, creator:{id:"9c12e0277854", username:"grepsr", name:"Grepsr", imageId:"1*sy_bq2oBDtRCg43IwVkXrw.png"}}`.

**Homepage curated selection (section=home)** — On `https://medium.com/<slug>`, `window.__APOLLO_STATE__` contains `PublicationPage:homepage` whose `sections[]` refs point to `PublicationPostsSection:<publicationId>-homepage-<N>` nodes with fields `{title, layout, posts: [{__ref: "Post:<id>"}]}`. These section nodes hold the full curated ordering (better-programming: 8 sections, 167 post refs — e.g. "Latest" ×10, "From the Archives" ×8, "Recent Articles" ×25), while the DOM only renders the first ~20 `article[data-testid="post-preview"]` cards. Order verified to match DOM rendering (grepsr-blog section first id `c76c3e22dc83` == first DOM card). Post nodes in Apollo are stubs (`{__typename, id}`) only.

**Post enrichment by id** — `query PostMeta($id: ID!) { post(id: $id) { id title mediumUrl clapCount firstPublishedAt latestPublishedAt readingTime postResponses { count } isLocked previewImage { id } extendedPreviewContent { subtitle } creator { username name imageId } tags { id displayTitle } } }`. The request body is an array of operations, so one POST can enrich many posts at once (verified with 2 ids → 2 results). Variable type must be `ID!` (`String!` is rejected with a schema error).

## Failure Signals

- Nonexistent or unresolvable slug: GraphQL returns `{"data":{"publication":null}}` and the page renders text "PAGE NOT FOUND" / "404". Must be detected before waiting for any content selector. Example slugs: `this-slug-should-not-exist-xyz123`, `towards-data-science` (moved off Medium to its own site; slug no longer resolves).
- Custom-domain publications (e.g. better-programming → betterprogramming.pub): `page.goto` follows the 301; relative fetch to `/_/graphql` still works on the custom origin (verified).
- No CAPTCHA / 403 / 429 observed during ~20 page/API operations. Polite pacing (random short waits, small mouse move, gentle scroll) is still kept in the implementation.
- Schema strictness: wrong GraphQL variable type returns an `errors` array instead of data — command code must surface such responses as failures, not empty results.
- Drift signal: if Medium renames `publicationByRef`/`publicationPostsConnection` or stops accepting ad-hoc queries, the command should fail loudly with `DRIFT_DETECTED`.

## Capture Assessment

Capture as `medium/get-publication` (browser runtime). The path was verified end-to-end with real data for both sections, is parameterizable by slug, and complements the existing medium command family (its article urls / author usernames chain directly into `medium/get-article` and `medium/get-author`). Contract approved on 2026-08-06.
