# Context

## Precipitation Background (Why This Command Exists)

Precipitated from the explore phase (trace audited with `websculpt explore assess`, passed; contract confirmed on 2026-08-17). The Twitch command family plan needed a "look at a streamer" entry point: given a channel login, return the profile plus current live state. Explored and verified directly against the internal GraphQL endpoint — the plan assumed browser runtime, but node direct access proved stable (12-call burst, zero 429, no rate-limit headers), so the runtime was re-judged to node with explicit approval.

## Value Assessment

High reuse value: `twitch/search` finds channels but cannot answer "what is this streamer's profile and is it live now". get-channel is the natural follow-up to any channel discovery (search result, live card, video/clip URL). Single parameter, node runtime (no browser overhead), one batched GraphQL request — fast and cheap to run. Language-independent (Chinese channels verified).

## Page Structure

Data comes from `https://gql.twitch.tv/gql` (POST, header `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko`, no auth). One batched POST carries three persisted queries:

- `ChannelShell` (hash `fea4573a7bf2644f5b3f2cbbdcbee0d17312e48d2e55f080589d053aad353f11`, vars `{login}`) — `userOrError`: login, displayName, profileImageURL, stream (`{id, viewersCount}` when live, `null` when offline), `UserDoesNotExist` for missing channels.
- `StreamMetadata` (hash `ad022ca32220d5523d03a23cbcb5beaa1e0999889c1f8f78f9f2520dafb5cae6`, vars `{channelLogin}`) — `user.stream` (`{type:"live", createdAt, game{name,slug}}` when live, `null` when offline) and `user.lastBroadcast.title` (current live title).
- `ChannelRoot_AboutPanel` (hash `3b9cd4edd28e8e6f7ba6152a56157bc2b1c1a8f6e81d70808ad1b85250e5288f`, vars `{channelLogin, skipSchedule:false}`) — `user.description`, `user.followers.totalCount`, `user.profileImageURL` (300x300), `user.displayName`.

## Environment Dependencies

- No login, no browser, no API key. Requires outbound HTTPS to `gql.twitch.tv` from the Node runtime.
- Public web Client-Id `kimne78kx3ncx6brgo4mv6wki5h1ko`; if it stops working, the gql endpoint will return an auth-style error → `DRIFT_DETECTED`.
- Polite pacing: the command issues exactly one batched request per invocation, so there are no intra-command rapid-fire requests. Retry backoff (1s, 2s, 3s) is built in for transient failures/429s. When chaining many get-channel calls, callers should space them out.
- Persisted-query hashes are registered server-side by the current Twitch web client. If Twitch updates the client and drops these hashes, calls return `PersistedQueryNotFound` → `DRIFT_DETECTED`.

## Failure Signals

- `userOrError.__typename === "UserDoesNotExist"` (HTTP 200, no GraphQL error) → `CHANNEL_NOT_FOUND`.
- HTTP non-200 (429, 5xx) → retried with backoff; persistent failure → `DRIFT_DETECTED`.
- `errors` entry in the batched response (e.g. `PersistedQueryNotFound`, service error) → `DRIFT_DETECTED`.
- Response missing one of the three expected operation results (shape drift) → `DRIFT_DETECTED`.
- Missing/blank `channel` → `MISSING_PARAM`.

## Repair Clues

- Re-verify the three persisted-query hashes by attaching to a Twitch channel page in the browser (Playwright CLI) and reading `request-body` / `response-body` for `gql.twitch.tv/gql` — the current hashes are in the batched initial request (`ChannelShell`, `StreamMetadata`) and the about-panel request (`ChannelRoot_AboutPanel`).
- If the endpoint requires an auth header in the future, add the anonymous OAuth token the web client uses, but note the contract is currently login-free.
- DOM fallback (browser runtime only): live title at `[data-a-target="stream-title"]`; followers/description only have unstable hashed classes and are not recommended.
