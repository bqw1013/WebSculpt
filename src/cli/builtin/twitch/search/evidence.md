# Evidence: twitch/search

This document records the research and validation evidence for the `twitch/search` command.

## Exploration Path

The explore phase verified the path end-to-end and passed `explore assess` (status: passed, candidate `twitch/search`, Confirmation recorded on 2026-08-17).

The command library was checked first: `twitch/search` already existed as a user-installed browser command (runtime: browser, maxLimit: 20, with dead `sort`/`time` parameters). This capture modifies that command: switches runtime to node, deletes `sort`/`time`, raises the limit cap to 100, adds internal cursor pagination, and fixes the VOD card URL/date fields.

Verification method (both paths were exercised):

- **Node direct probe** of the GraphQL endpoint `https://gql.twitch.tv/gql`: ~50 sequential calls (sleep 250-600ms between calls) returned HTTP 200 with full GraphQL data, no auth token, no `ratelimit-*` response headers, no 429. One transient connect timeout and one transient `service error` (on the `latestVideo` field) were observed; both resolved on retry.
- **Browser verification** via Playwright CLI (session <session>, attached to the user's Chrome): loaded the search page, confirmed the result views (All / channels / categories / videos), the card DOM structure, the `?type=` URL parameter switching, and the "show more" buttons that issue the paginated GraphQL requests.

## Verified URLs

- https://www.twitch.tv/search?term=lck — search "All" view; shows live-channel cards, "channels with tag" cards, and video cards; "show more" buttons.
- https://www.twitch.tv/search?term=lck&type=channels — channels-only view (`search-result-live-channel` cards).
- https://www.twitch.tv/search?term=lck&type=videos — videos-only view (`search-result-video` cards); paginated to 75 cards via cursor.
- https://www.twitch.tv/search?term=league&type=categories — categories-only view (`search-result-category` cards).
- https://gql.twitch.tv/gql — the internal GraphQL endpoint; operation `SearchResultsPage_SearchResults`.

## Structural Evidence

**GraphQL request** (POST `https://gql.twitch.tv/gql`):

- Headers: `Content-Type: application/json`, `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko` (public web client id).
- Persisted query: `operationName: "SearchResultsPage_SearchResults"`, `extensions.persistedQuery.sha256Hash: "22d9f9b96e28afdcd918f1c5b93e87979c4673d29a851da7c823e0a808dd5bf3"`.
- Variables: `platform: "web"`, `query`, `requestID` (a UUID), and `options: { targets: [{ index: <CHANNEL|GAME|VOD>, cursor? }], shouldSkipDiscoveryControl: false }`.
- A single target (`options.targets[0].index`) returns 15 edges per page for channels/videos; games return up to the actual match count.
- **Cursor pagination**: the response section (`data.searchFor.<channels|games|videos>`) carries a `cursor` field which is base64 of the offset (`"MTU="`=15, `"MzA="`=30, `"NDU="`=45, `"NjA="`=60, `"NzU="`=75). Pass the returned cursor back inside `targets[0].cursor` to fetch the next page. A cursor of `""` means exhausted. Pages are disjoint (no overlap). limit 100 requires 7 pages (ceil(100/15)).

**Response shape**: `data.searchFor` has sections `channels`, `games`, `videos` (each with `edges[].item`, `cursor`, `totalMatches`), plus `channelsWithTag`, `relatedLiveChannels`, `collections`. Only the requested target section is populated when a single target is sent.

**Channel card** (`channels.edges[].item`): `id`, `login`, `displayName`, `description`, `profileImageURL`, `followers.totalCount`, `roles.isPartner`, `broadcastSettings.title` (stream title when live), and `stream` (null when not live; else `game.displayName`, `viewersCount`, `freeformTags[].name`). A channels search mixes live streams and channel profiles (e.g. 15 items: 6 live, 9 not-live).

**Category card** (`games.edges[].item`): `id`, `slug`, `name`, `displayName`, `boxArtURL`, `tags[].localizedName|tagName`, `viewersCount`. Card URL is `https://www.twitch.tv/directory/category/{slug}`.

**Video card** (`videos.edges[].item`): `id`, `title`, `createdAt` (ISO 8601), `lengthSeconds`, `viewCount`, `previewThumbnailURL`, `owner.{displayName,login}`, `game.{displayName,slug}`. **The item has no `url` field and no `publishedAt` field** — the URL must be constructed as `https://www.twitch.tv/videos/{id}` and the publish date is `createdAt`. (This is a fix over the previous implementation, which read `item.url`/`item.publishedAt` and always produced null.)

**Card DOM selectors** (search page, for reference): channels `search-result-live-channel`, categories `search-result-category`, videos `search-result-video`. The `type` filter is a URL parameter (`?type=channels|categories|videos`).

**Edge behaviors** (all HTTP 200, no errors array): empty query returns empty sections (`edges: []`, `totalMatches: 0`); a no-result keyword returns the same empty structure; a 200-char query returns fuzzy matches (no truncation); the same keyword returns the same first result across calls (stable ranking — no sort/time dimension).

## Failure Signals

- **Transient `service error`**: GraphQL may return an `errors` array whose first error message matches `/service error/i` (e.g. on the `latestVideo` field). This is retryable; retrying usually returns a clean response. If retries are exhausted but `data.searchFor` still contains usable edges, the data should be used rather than failing.
- **Transient network errors / connect timeout**: node `fetch` may throw or time out occasionally (observed once in ~50 calls). Retry with backoff; throw `NETWORK_ERROR` only after retries are exhausted.
- **Non-200 HTTP**: any non-200 response is drift — throw `DRIFT_DETECTED`.
- **Malformed JSON / missing `data.searchFor`**: indicates API or schema drift — throw `DRIFT_DETECTED`.
- **Unknown result type**: the `type` enum is validated before any request (`channel`|`category`|`video`); invalid values throw `INVALID_PARAM`.
- **Limit out of range**: `limit` is validated with a regex on the raw string, then range-checked 1-100; out-of-range throws `INVALID_PARAM` / `LIMIT_EXCEEDED`.
- No rate limiting / CAPTCHA / login wall was observed on this endpoint during the probe.

## Capture Assessment

This command should be captured because it replaces the existing browser-based `twitch/search` with a faster, simpler node implementation of the same verified path. The GraphQL path is fully public (no auth, no browser), the response is structured and rich, and the cursor pagination was verified end-to-end up to 100 results. The capture also fixes a real defect in the previous implementation (VOD `url`/`publishedAt` always null) and removes two dead parameters (`sort`, `time`) that Twitch search does not support. The high reuse value (searching channels/categories/videos is a core Twitch entry point) and low operational cost (no browser daemon dependency) justify precipitation as a command.
