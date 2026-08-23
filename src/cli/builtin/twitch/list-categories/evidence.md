# Evidence: twitch/list-categories

This document records the research and validation evidence for the `twitch/list-categories` command.

## Exploration Path

- Command library check (`websculpt command list twitch`): only `twitch/search` exists (browser runtime, no login). It returns categories by keyword search, but cannot answer "which categories are hottest by live viewers". No existing category-ranking command; `twitch/list-categories` is new. No name conflict.
- Explore workspace audited with `websculpt explore assess` (passed 2026-08-17, user confirmed contract).
- Runtime contract consulted before editing `draft/command.js`.
- Direct node fetch against Twitch's internal GraphQL was probed first (no browser required); browser path (`/directory`) was additionally verified via Playwright CLI attach for comparison.

## Verified URLs

- `https://gql.twitch.tv/gql` — Twitch internal GraphQL POST endpoint. Returns the category ranking via the `games` field (HTTP 200, no auth, no 429 across ~25 probes).
- `https://www.twitch.tv/directory` — Browse page "Categories" tab. Default view is a curated "For You" sort; the main grid is capped at 30 cards with no pagination. Used only as the browser-side comparison.
- `https://www.twitch.tv/directory?sort=VIEWER_COUNT` — Same page with the "Viewers high to low" sort applied (stable URL parameter). Reorders the grid to match the GraphQL `games` ranking exactly.
- `https://static-cdn.jtvnw.net/ttv-boxart/{id}-{width}x{height}.jpg` — Category box-art CDN URL template (the rendered grid uses concrete size `285x380`).

## Structural Evidence

GraphQL endpoint facts:

- POST `https://gql.twitch.tv/gql`, headers `Content-Type: application/json` and `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko` (public web client ID). No login, no auth token.
- Schema introspection is blocked (`{ __schema }` and `{ __type(name:"Query") }` both return `data:{}`), but the endpoint accepts arbitrary GraphQL query text.

Category ranking query (verified; `first` 1/5/20/50/100 all return the requested count, no integrity challenge):

```graphql
query { games(first: N) { edges { cursor node { id name displayName slug viewersCount boxArtURL tags(tagType: CONTENT) { localizedName } } } pageInfo { hasNextPage endCursor } } }
```

Real sample (2026-08-17, `first: 100`):

```json
{"name":"Just Chatting","slug":"just-chatting","viewersCount":175816,"tags":["IRL"],"boxArtURL":"https://static-cdn.jtvnw.net/ttv-boxart/509658-{width}x{height}.jpg"}
{"name":"Escape from Tarkov","slug":"escape-from-tarkov","viewersCount":88787,"tags":["FPS","Shooter","RPG","Simulation","MMO","Action"],"boxArtURL":"https://static-cdn.jtvnw.net/ttv-boxart/491931_IGDB-{width}x{height}.jpg"}
{"name":"League of Legends","slug":"league-of-legends","viewersCount":80047,"tags":["RPG","Strategy","MOBA","Action"],"boxArtURL":"https://static-cdn.jtvnw.net/ttv-boxart/21779-{width}x{height}.jpg"}
```

Structural facts:

- `games.edges[].node` fields: `id`, `name`, `displayName` (both English, equal for games), `slug`, `viewersCount` (raw number), `boxArtURL` (template with `{width}x{height}` placeholder), `tags(tagType: CONTENT)` (array of `{ localizedName }`).
- Ordering is strictly `viewersCount` descending (verified monotonic across 30 sampled items). Ranking shifts slightly between calls due to live viewer fluctuation.
- `games(first: 100)` returns 100 edges with `pageInfo.hasNextPage: true`; default (no `first`) returns 10 edges. `first: 1/5/20/50/100` all verified with no errors.
- 99 of 100 top categories have non-empty content tags (English genre labels: FPS/Shooter/RPG/Strategy/MOBA/IRL/Simulation...). Tags map to the genre tag chips shown on the browse page.
- `slug` is the canonical path segment used in `https://www.twitch.tv/directory/category/{slug}` (verified in the browser grid hrefs) and is directly consumable as `twitch/get-feed --category`.

Browser-side comparison (verified, not used for extraction):

- `/directory` default "Categories" view is curated ("为您推荐"), NOT viewer-sorted; the "观众人数（高到低）" sort option appends `?sort=VIEWER_COUNT` to the URL and reorders the grid to the viewer ranking.
- Main grid card: `a.game-card__link[data-a-target="tw-box-art-card-link"][href="/directory/category/{slug}"]`, name in `h2[title]`, viewers in `p > a[aria-label="有 {N} 名观众在观看 {name}"]`, box art `img.tw-image` at `285x380`. Cards do NOT display tags (tags are top filter chips / sidebar cards only).
- Main grid is fixed at 30 category cards with no "Show more" button and no scroll loading — the browser path cannot cover limit 51-100.

## Failure Signals

- `games(after: "<cursor>")` deterministically fails with `IntegrityCheckFailed` (`extensions.code: IntegrityCheckFailed`, `challenge.type: integrity`) — Twitch's integrity check for server-side cursor pagination. Therefore the command must NOT paginate via `after`; `first: N` (N ≤ 100) fetches everything needed in one request.
- GraphQL introspection returns empty `data` (blocked), so do not attempt schema discovery at runtime.
- Unknown/invalid GraphQL fields return validation errors in `errors[].message` (e.g. `Cannot query field ... on type "Query"`) — a possible drift signal if Twitch renames `games`.
- No 429 and no `ratelimit-*` headers observed across ~25 sequential node requests (200-700ms random sleeps). If a 429 or `service error` appears, retry with backoff.
- `tags` requires the `tagType` argument (`TagType!`); omitting it raises a GraphQL validation error. `Tag` nodes expose `localizedName`, not `name`.

## Capture Assessment

This command should be captured. It answers a high-frequency need ("which Twitch categories are hot right now") with a clean, deterministic node path: a single `games(first: limit)` GraphQL request (no login, no browser, no rate limit observed) covers the full `limit` range 1-100, returns richer data than the browser grid (raw viewer numbers, genre tags, category id), and its `slug` output feeds directly into `twitch/get-feed --category`. The browser path was ruled out because the `/directory` grid is capped at 30 cards with no pagination and returns localized text that would need parsing. Runtime: `node`.
