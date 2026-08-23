# Context

## Precipitation Background (Why This Command Exists)

Twitch's clip list pages (`twitch/get-channel-clips`, channel `/clips` tab) return only compact cards. To see a single clip's full record (exact view count, clipper, creation date, source broadcast reference) you must open the clip detail page. This command captures the validated path: one POST to Twitch's internal GraphQL `ShareClipRenderStatus` operation with the public web Client-ID returns the complete clip object — no login, no browser, no auth token.

## Value Assessment

Complements the planned `twitch/get-channel-clips` list command (its `url` output is this command's input). Reuse frequency: moderate — used whenever a clip card needs its full detail. Runtime is node (direct API call), so it is fast and cheap, and it runs headlessly without needing the user's browser attached. Also serves as the reference implementation for the sibling `twitch/get-video` command (same GraphQL host, same public Client-ID, different persisted query).

## Page Structure

Not a page — a GraphQL API. Endpoint: `https://gql.twitch.tv/gql` (POST, JSON body array of operation objects).

- Operation: `ShareClipRenderStatus`, variables `{ slug }`, persisted-query hash `552c19362ba6033f564e5e25ba9c6e4f5b34cd3a734ba69e5ed61c7ab0d439b9`.
- Headers: `Content-Type: application/json`, `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko`.
- Response array element: `data.clip` holds the full clip object (`title`, `url`, `viewCount`, `curator`, `game`, `broadcaster`, `durationSeconds`, `createdAt`, `thumbnailURL`, `video`, `broadcast`, ...).
- Clip URL shape: `https://www.twitch.tv/{channel}/clip/{slug}`; the slug (e.g. `ObeseDarkLapwingPartyTime-sYFEmpufSo89ELev`) is globally unique.

## Environment Dependencies

- No login, no cookies, no API key. The public web Client-ID is embedded in the Twitch web client.
- Node runtime global `fetch` (Node >= 18).
- Request pacing: this command makes one request per invocation (plus at most 2 retries with a random 200-700ms backoff), which stays well below observed Twitch rate limits (a 12-call burst at 200-700ms spacing produced zero 429s).
- `viewCount` is live and grows over time; never treat a specific count as fixed.

## Failure Signals

- `data.clip === null` with HTTP 200 → nonexistent/deleted slug → `NOT_FOUND`.
- HTTP 429 → rate limiting → `RATE_LIMITED`.
- HTTP 400 "The Client-ID header is missing" → Client-ID drift.
- HTTP 5xx, non-array/empty JSON, missing `data.clip`, or `errors` in the response → structure or API drift → `DRIFT_DETECTED`.
- Stale `sha256Hash` (Twitch updates their GraphQL schema) surfaces as a GraphQL error / unexpected response → `DRIFT_DETECTED`.

## Repair Clues

- If `ShareClipRenderStatus` hash goes stale, re-derive it from a live browser session: open a clip page, capture the gql POST whose operationName is `ShareClipRenderStatus`, and copy the new `sha256Hash` and variables shape.
- Fallback operation with identical variables: `FeedInteractionHook_GetClipBySlug` (hash `8ed8cce33cf76b576a99dd8cd5db7cb6e7f0e6111bd1927b49c0cada0513d7b6`) — returns the core clip fields but WITHOUT curator (clipper), createdAt, or video (source) reference. Prefer `ShareClipRenderStatus`; use the fallback only to recover the core fields.
- The `video` field is the source-broadcast reference; when non-null the source VOD URL is `https://www.twitch.tv/videos/{video.id}`. `broadcast.id` is always populated but is NOT a confirmed viewable VOD link, so it is not used for `sourceVideoUrl`.
