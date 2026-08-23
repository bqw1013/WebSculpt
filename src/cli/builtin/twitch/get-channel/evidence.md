# Evidence: twitch/get-channel

This document records the research and validation evidence for the `twitch/get-channel` command.

## Exploration Path

- Checked the WebSculpt command library with `websculpt command list twitch`; only `twitch/search` exists (browser runtime, no login). It is complementary (search finds channels by keyword) and does not conflict with get-channel.
- Consulted the Playwright CLI access guide before using `@playwright/cli` in the explore phase.
- Ran a full explore workspace audited with `websculpt explore assess` (status: passed). Contract confirmed on 2026-08-17.
- Explored Twitch channel pages (`/lck`, `/gorgc`, `/gorgc/about`) via Playwright CLI attach to the user's Chrome and monitored network requests with `playwright-cli requests` / `request-body` / `response-body`.
- Probed node direct access to the internal GraphQL endpoint `https://gql.twitch.tv/gql` with the public web `Client-Id`. All three channel-detail operations returned HTTP 200 without any auth token; a 12-call burst produced zero 429 responses and no rate-limit headers. This justifies re-judging the runtime from browser (as the plan assumed) to node.

## Verified URLs

- https://gql.twitch.tv/gql
- https://www.twitch.tv/lck
- https://www.twitch.tv/gorgc
- https://www.twitch.tv/gorgc/about
- https://www.twitch.tv/directory/all

## Structural Evidence

All channel data comes from the internal GraphQL endpoint `https://gql.twitch.tv/gql`, POST with header `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko`, no auth required. Three persisted queries, sent as one batched array in a single POST, cover every output field:

### Operation: ChannelShell
- sha256Hash: `fea4573a7bf2644f5b3f2cbbdcbee0d17312e48d2e55f080589d053aad353f11`
- variables: `{ "login": "<channel>" }`
- Returns `userOrError`:
  - Live channel: `__typename: "User"` with `id`, `login`, `displayName`, `primaryColorHex`, `profileImageURL` (70x70), `bannerImageURL`, `channel.id`, and `stream` = `{ id, viewersCount, __typename: "Stream" }`.
  - Offline channel: same fields but `stream: null`.
  - Non-existent channel: `__typename: "UserDoesNotExist"` with `{ userDoesNotExist: "<login>", reason: "UNKNOWN" }`.
- Real sample (gorgc, live): `"stream": { "id": "318129785191", "viewersCount": 4759, "__typename": "Stream" }`.
- Case-insensitive: `login: "LCK"` resolves to the same user as `"lck"` (login normalized to lowercase `lck`).

### Operation: StreamMetadata
- sha256Hash: `ad022ca32220d5523d03a23cbcb5beaa1e0999889c1f8f78f9f2520dafb5cae6`
- variables: `{ "channelLogin": "<channel>" }`
- Returns `user`:
  - Live channel: `stream` = `{ id, type: "live", createdAt, game: { id, slug, name }, __typename: "Stream" }` and `lastBroadcast.title` = the current live title (lastBroadcast.id equals stream.id).
  - Offline channel: `stream: null`; `lastBroadcast.title` keeps the most recent broadcast title.
  - Non-existent channel: `user: null`.
- Real sample (gorgc, live): `"stream": { "id": "318129785191", "type": "live", "createdAt": "2026-08-17T11:06:24Z", "game": { "id": "29595", "slug": "dota-2", "name": "Dota 2", "__typename": "Game" }, "__typename": "Stream" }`, `"lastBroadcast": { "id": "318129785191", "title": "UNBANNED - FANTASY TOP 99.99% - PREDICTIONS - RECAP" }`.

### Operation: ChannelRoot_AboutPanel
- sha256Hash: `3b9cd4edd28e8e6f7ba6152a56157bc2b1c1a8f6e81d70808ad1b85250e5288f`
- variables: `{ "channelLogin": "<channel>", "skipSchedule": false }`
- Returns `user`:
  - `description` (may be an empty string), `displayName`, `profileImageURL` (300x300), `followers.totalCount`, `roles.{isPartner,isAffiliate}`, `primaryTeam`, `lastBroadcast.game`, `videos.edges`.
  - Non-existent channel: `user: null`.
- Real sample (gorgc): `"description": ":)"`, `"displayName": "Gorgc"`, `"followers": { "totalCount": 781579 }`.
- Chinese channel sample (offline): `displayName: "<cn-name>"`, `description: "<cn-description>"`, `followers.totalCount: <count>`.

### Combined output mapping (plan contract → source)
| Output field | Source |
|---|---|
| `channel` | ChannelShell userOrError.login (normalized lowercase) |
| `displayName` | ChannelShell / AboutPanel user.displayName |
| `followers` | AboutPanel user.followers.totalCount |
| `description` | AboutPanel user.description (empty string → null) |
| `avatarUrl` | AboutPanel user.profileImageURL (300x300) |
| `isLive` | ChannelShell.userOrError.stream != null |
| `live.title` | StreamMetadata lastBroadcast.title |
| `live.category` | StreamMetadata stream.game.name |
| `live.viewers` | ChannelShell stream.viewersCount |
| `live.startedAt` | StreamMetadata stream.createdAt |
| `url` | `https://www.twitch.tv/${channel}` |

### DOM fallback (browser only, not used)
- Live title has a stable selector `[data-a-target="stream-title"]`. Followers/description only have unstable hashed classes (`SPAN.CoreText-sc-1txzju1-0 ...`), so the GraphQL path is the primary and only stable source.

## Failure Signals

- `ChannelShell` returns `userOrError.__typename === "UserDoesNotExist"` for a non-existent channel (HTTP 200, no GraphQL error) -> command should throw `CHANNEL_NOT_FOUND`. `StreamMetadata` and `AboutPanel` return `user: null` as a secondary signal.
- HTTP non-200 from `gql.twitch.tv/gql` (e.g. 429 rate limit or transient 5xx) -> retry with backoff, then throw `DRIFT_DETECTED` (endpoint, persisted-query hash, or network state changed).
- Persisted queries are registered server-side; if a hash returns `PersistedQueryNotFound`, the query text is stale and the command should throw `DRIFT_DETECTED`.
- Malformed/unexpected response shape (missing `userOrError` / `data` / batching array) -> throw `DRIFT_DETECTED`.
- Missing `channel` parameter -> throw `MISSING_PARAM`.
- Empty string / whitespace-only `channel` -> throw `MISSING_PARAM`.

## Capture Assessment

This command should be captured. The three persisted GraphQL operations were verified end-to-end from node (no login, no browser, no rate limiting observed over 12 burst calls) for both live (`gorgc`, `bainyn`) and offline (`lck`, `<cn-channel>`) channels, including a Chinese-language channel, a case-insensitive login, and a non-existent channel. The path is stable, parameterizable by a single `channel` input, and returns structured data that matches the confirmed contract. Runtime is node.
