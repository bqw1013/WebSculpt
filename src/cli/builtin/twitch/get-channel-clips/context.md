# Context

## Precipitation Background (Why This Command Exists)

Precipitated from the Twitch command family plan after explore verification of the channel Clips tab path (contract confirmed 2026-08-17). Twitch clips are viewer-created short highlights ranked by popularity within a time window — a fast way to see a channel's top moments, distinct from the channel's own long-form videos.

## Value Assessment

Reusable for any Twitch channel clips query; complements `twitch/search` (find channels) and the planned `twitch/get-channel-videos` (channel's own VODs) and `twitch/get-clip` (single clip detail). Saves navigating the JS-rendered Clips tab and parsing the DOM. Fetches via the same internal GraphQL pattern used by the installed `twitch/search`.

## Page Structure

- Endpoint: `https://gql.twitch.tv/gql` (POST), public web Client-Id `kimne78kx3ncx6brgo4mv6wki5h1ko`, CORS open (`Access-Control-Allow-Origin: *`).
- Operation `ClipsCards__User`, persisted query sha256 `1cd671bfa12cec480499c087319f26d21925e9695d1f80225aae6a4354f23088`.
- Variables: `{ login, limit, criteria: { filter, shouldFilterByDiscoverySetting: true }, cursor: null }`.
- Range → filter: `24h`→`LAST_DAY`, `7d`→`LAST_WEEK`, `30d`→`LAST_MONTH`, `all`→`ALL_TIME`.
- Edge node fields: `title` / `url` (https://www.twitch.tv/{channel}/clip/{slug}) / `viewCount` / `curator{displayName,login}` / `durationSeconds` / `createdAt` (ISO 8601) / `thumbnailURL`.
- On-page range dropdown: button `[data-a-target="time-filter-selection"]`, options `[data-a-target^="time-filter-option"]`. DOM cards: `article` with `h4[title]`, `a[data-a-target="preview-card-image-link"]` (thumbnail + duration/views/relative-time overlay), clipper text "由 X 剪辑". The DOM only shows relative time (e.g. "3天前"), not absolute `createdAt` — GraphQL is the source for `createdAt`.

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled (daemon attaches via CDP); no Twitch login required for public clips.
- Polite pacing: random delay 300-700ms before each GraphQL request + a small random mouse move; keep invocation frequency modest.
- Cursor pagination is blocked by Twitch's integrity challenge (`IntegrityCheckFailed`) for both node fetch and a plain in-page fetch — do not attempt cursor pagination; use a single request with `limit` (1-100) and rely on `partial`.
- The page auto-widens the range window when the default has no clips (e.g. an offline channel lands on 30d, a clip-less channel on `all`); the command always sets the GraphQL `filter` explicitly so results are deterministic.

## Failure Signals

- `data.user` null → channel does not exist (`CHANNEL_NOT_FOUND`).
- `data.user.clips.edges` empty → channel has no clips in the window (valid empty result; return `items: []`).
- GraphQL `errors` array non-empty, or `PersistedQueryNotFound` → `DRIFT_DETECTED` (the persisted-query hash may need refreshing).
- HTTP != 200 after retries → `DRIFT_DETECTED`.

## Repair Clues

- If the persisted-query hash goes stale (`PersistedQueryNotFound`), re-capture the current hash from the live Clips tab network requests (operation `ClipsCards__User`).
- If the GraphQL shape changes, the on-page DOM (article cards, `preview-card-*` data-a-targets) is a fallback source, but it only gives relative time, not absolute `createdAt`.
