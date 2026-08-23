# Context

## Precipitation Background (Why This Command Exists)

Captured from the explore phase (2026-08-17, assess passed, user confirmed). The `twitch/get-feed` command needs a category `slug` source, and "which Twitch categories are hot right now" (ranked by live viewers) is itself a high-frequency need. The browser `/directory` page cannot serve this command because its main grid is capped at 30 cards with no pagination and returns localized text; the internal GraphQL `games` field returns the full viewer-sorted ranking in one request.

## Value Assessment

- Answers a recurring need: current hottest Twitch categories (games/topics) by live viewers.
- Produces `slug` values consumed directly by `twitch/get-feed --category` and by `/directory/category/{slug}` URLs.
- Single deterministic node request (no login, no browser, no rate limit observed in ~25 probes) covers the full `limit` 1-100 range.
- Data is cleaner than the DOM: raw viewer numbers, English names, English genre tags, category id.

## Page Structure

- API: `POST https://gql.twitch.tv/gql`, headers `Content-Type: application/json`, `Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko` (public web client ID).
- Query: `query { games(first: N) { edges { cursor node { id name displayName slug viewersCount boxArtURL tags(tagType: CONTENT) { localizedName } } } pageInfo { hasNextPage endCursor } } }`
- Response: `data.games.edges[].node` with `id`, `name`, `displayName`, `slug`, `viewersCount`, `boxArtURL` (template with `{width}x{height}`), `tags` (`{localizedName}` array). Ordering is strictly `viewersCount` descending.
- Browser reference (not used for extraction): `https://www.twitch.tv/directory?sort=VIEWER_COUNT` — grid card `a.game-card__link[data-a-target="tw-box-art-card-link"][href="/directory/category/{slug}"]`, name in `h2[title]`, viewers in `p > a[aria-label="有 {N} 名观众在观看 {name}"]`, box art `img.tw-image` at `285x380`.

## Environment Dependencies

- No login, no auth token, no browser. Runs in Node.
- Polite pacing: 200-700ms random sleep between retry requests.
- Box art URL: the API returns a template (`...-{width}x{height}.jpg`); the command substitutes `285x380` for a directly usable URL.

## Failure Signals

- `games(after: "...")` → `IntegrityCheckFailed` (`extensions.code`, `challenge.type: integrity`): Twitch's integrity check for server-side cursor pagination. Do NOT paginate via `after`; `first: N` covers the full limit range.
- Introspection returns empty `data` — blocked, never rely on runtime schema discovery.
- Unknown GraphQL field → validation error `Cannot query field ... on type "Query"` in `errors[]` — likely drift signal if Twitch renames `games`.
- `tags` requires `tagType` argument (`TagType!`); `Tag` nodes expose `localizedName` (no `name`).
- HTTP 429 or `service error` — retry with backoff (already implemented, up to 4 attempts).

## Repair Clues

- If `games` is renamed, probe the schema by sending candidate query texts (introspection is blocked, but validation errors reveal valid/invalid fields). The fallback page is `https://www.twitch.tv/directory?sort=VIEWER_COUNT` (browser DOM), which caps at 30 and needs localized-number parsing.
- Persisted-query alternative: a custom query can be registered via the Apollo flow (send query text + sha256 hash together, then hash-only works), but raw query text is simpler and verified.
- The `twitch/search --type category` command is a separate keyword-search path and returns `avatarURL`; do not confuse it with this viewer ranking.
