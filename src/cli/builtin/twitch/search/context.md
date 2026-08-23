# Context

## Precipitation Background (Why This Command Exists)

`twitch/search` is the entry point for finding channels, categories, or videos by keyword on Twitch. It was precipitated as a modification of the previous browser-based command: the exploration phase verified that the internal GraphQL endpoint `https://gql.twitch.tv/gql` answers anonymous node requests with the public web Client-Id — no browser, no login, no rate limit observed across ~50 calls — so the runtime was switched from browser to node. The modification also removed two dead parameters (`sort`, `time`) that Twitch search does not support, raised the limit cap from 20 to 100 via internal cursor pagination, and fixed a defect where VOD cards always returned null for `url` and `publishedAt`.

## Value Assessment

Searching Twitch is a core navigation need (find a streamer, a game, or a VOD). This command gives structured JSON from a single public endpoint, is much cheaper than a browser session, and its `category` results feed directly into `twitch/get-feed`. Reuse frequency is high and per-call cost is low (one HTTP request plus pagination).

## Page Structure

- Endpoint: `https://gql.twitch.tv/gql` (POST). Headers: `Content-Type: application/json`, `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko`.
- Operation: `SearchResultsPage_SearchResults`, persisted hash `22d9f9b96e28afdcd918f1c5b93e87979c4673d29a851da7c823e0a808dd5bf3`.
- Variables: `platform: "web"`, `query`, `requestID` (any UUID), `options.targets = [{ index: CHANNEL|GAME|VOD, cursor? }]`, `options.shouldSkipDiscoveryControl: false`.
- Response: `data.searchFor.<channels|games|videos>.edges[].item`. Each section also has `cursor` (next-page cursor, `""` = exhausted) and `totalMatches`.
- Pagination: 15 items per page; pass the response section's `cursor` back inside `targets[0].cursor`. Cursor is base64 of the offset (`"MTU="`=15, `"MzA="`=30, ...). Pages are disjoint.
- Search UI (reference): `https://www.twitch.tv/search?term={q}` with `&type=channels|categories|videos`. Card DOM targets: `search-result-live-channel`, `search-result-category`, `search-result-video`.

## Environment Dependencies

- Node runtime with global `fetch`. No API key, no login, no browser, no daemon.
- The Client-Id is Twitch's public web client id; if it changes, the endpoint returns an error and `DRIFT_DETECTED` is thrown.
- Polite pacing: pagination inserts a random 200-700ms sleep between page requests. No CAPTCHA/login wall observed.

## Failure Signals

- `errors[0].message` matches `/service error/i` → transient, retry; if retries exhaust but data is present, use it.
- `fetch` throws (network/connect timeout) → transient, retry; persistent → `NETWORK_ERROR`.
- Non-200 HTTP, malformed JSON, missing `data.searchFor`, or a non-retryable GraphQL error → `DRIFT_DETECTED` (page/API changed).
- Empty query / no-result keyword → HTTP 200 with empty `edges` arrays (no error), command returns `count: 0`, `partial` omitted.

## Repair Clues

- If the persisted hash stops working, re-capture the operation from a live search page: open `https://www.twitch.tv/search?term=x`, open DevTools Network, filter `gql.twitch.tv/gql`, and copy the `extensions.persistedQuery.sha256Hash` from the `SearchResultsPage_SearchResults` request.
- If the `searchFor` sections move, re-derive the section names from the response keys (`channels`, `games`, `videos`).
- If the video card is missing `createdAt`/`lengthSeconds`/`viewCount`, inspect a fresh VOD item's keys — the GraphQL item shape may have been extended; the card URL is always `https://www.twitch.tv/videos/{id}`.
