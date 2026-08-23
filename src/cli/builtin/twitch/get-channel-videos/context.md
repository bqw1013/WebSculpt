# Context

## Precipitation Background (Why This Command Exists)

Twitch's channel Videos tab (`twitch.tv/{channel}/videos`) is the canonical way to enumerate a channel's long-form VOD archive (past broadcasts, highlights, uploads). The WebSculpt Twitch command batch planned this as a browser-runtime command, but the explore phase proved the underlying data comes from a single internal GraphQL persisted operation that answers directly over plain HTTP — no login, no integrity token, no rate limit observed. Precipitated as a node-runtime command to avoid the browser-attach overhead.

## Value Assessment

Reuse value is high and general: any time a user wants "what videos has channel X posted", this returns a structured list with richer fields than the page DOM (absolute publishedAt, lengthSeconds, game.slug). It is the back-half of the Twitch content family (get-channel → get-channel-videos → get-video), and its category slug output feeds category-based commands. Each run saves a browser attach + multi-step page interaction, replacing it with one HTTP POST.

## Page Structure

- Page URL: `https://www.twitch.tv/{channel}/videos`
- Data actually comes from GraphQL `https://gql.twitch.tv/gql`, persisted operation `FilterableVideoTower_Videos` (sha256 `67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f`).
- Request body (array): `{ operationName, variables: { includePreviewBlur, limit, channelOwnerLogin, broadcastType, videoSort }, extensions: { persistedQuery: { version, sha256Hash } } }`.
- `broadcastType`: `null`(all) / `"ARCHIVE"`(past-broadcasts) / `"HIGHLIGHT"`(highlights) / `"UPLOAD"`(uploads). `"COLLECTION"` is rejected by the API — the page's 播放列表 (collections) option uses a separate operation `ChannelCollectionsContent` and returns collections, not videos (deliberately out of scope).
- `videoSort`: `"TIME"` (date, page default) or `"VIEWS"` (popularity).
- Response (array): `[0].data.user.videos.edges[].node` with `id, title, lengthSeconds, viewCount, publishedAt, previewThumbnailURL, game{displayName,slug}, owner{login,displayName}`, and `pageInfo.hasNextPage`.
- Browser DOM (fallback reference only, if a browser runtime is ever needed): card container `article`; stable hooks `a[data-a-target="preview-card-image-link"]` (href=/videos/{id}, innerText lines = duration/views/date), `preview-card-channel-link`, `preview-card-game-link`, `article h4` (title), `img[data-test-selector="preview-card-thumbnail__image-selector"]` (thumbnail). Anonymous page grid caps at 30 cards with no "Show more" button; scroll container `div.scrollable-area.root-scrollable`.

## Environment Dependencies

- Runtime `node`: uses global `fetch` and `setTimeout` only; no third-party modules.
- Public Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko` (Twitch web Client-ID), header `Client-ID`. No auth token, no integrity.
- Polite pacing: command sleeps a random 200-700ms before the request; retries transient failures with backoff (3 attempts). Probes (10 concurrent + 20 paced across 6 channels) showed no 429.
- Network: relies on outbound HTTPS to `gql.twitch.tv` (through the machine's normal routing).

## Failure Signals

- HTTP status != 200 from the GraphQL endpoint → transient or structural failure; command retries then throws `DRIFT_DETECTED`.
- `data.user === null` → channel does not exist → returns `channelFound: false` (not an error).
- `data.user.videos` missing/undefined → channel exists but no accessible videos → empty `results` with `channelFound: true`.
- Response no longer an array / `data` missing / `user.videos` not an object / GraphQL `errors` present → structure changed → `DRIFT_DETECTED`.
- If Twitch starts requiring an integrity token or returns 403/429 for the public Client-ID, the node path degrades; fallback is running the same operation through the browser runtime.

## Repair Clues

- First re-verify the persisted query hash: load `https://www.twitch.tv/{channel}/videos` in a browser and hook `fetch` to capture the current `FilterableVideoTower_Videos` request (variables + sha256Hash). Update `SHA256_HASH` in command.js if it changed.
- If the operation name changes, re-capture via network inspection (the page may still use the same endpoint).
- If the enum values change (e.g. new broadcastType), re-open the filter dropdown and read each option's URL (`?filter=`) plus the corresponding GraphQL variable.
- Existing search command `twitch/search` shares the same endpoint and Client-ID — a break there likely signals a shared change.
