# Context

## Precipitation Background (Why This Command Exists)

Twitch's core browse scenario is "what's live now / which channels are streaming this game". `twitch/search` can only find by keyword and cannot answer that. `twitch/get-feed` reads the live-channel grid on `/directory/all` and `/directory/category/{slug}`, returning live cards with viewer counts — the entry point for the whole Twitch browse flow. Contract confirmed on 2026-08-17.

## Value Assessment

High reuse value: "what's live now" and "who's streaming this game" are the most common Twitch lookups. The live grid is also the discovery source for channel logins used by `twitch/get-channel`, `get-channel-videos`, `get-channel-clips`. Saved context: verified DOM selectors, the 34-option language menu, the 4-option sort menu, and the anonymous cap findings.

## Page Structure

- **Primary implementation — in-page GraphQL** (mirrors `twitch/search`):
  - All channels: `BrowsePage_Popular`, hash `97fed6737c9ef90e8552fb7d02bf4e5d20da0af3cad2a5492d9c93f94e95c29e`; variables `{ imageWidth:50, limit:30, platformType:"all", options:{ sort, broadcasterLanguages, ... }, sortTypeIsRecency }`. Response `data.streams.edges[]`.
  - Category: `DirectoryPage_Game`, hash `86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd`; variables include `slug`. Response `data.game.streams.edges[]`.
  - Node fields: `broadcaster.login`, `title`, `game.displayName`/`slug`, `viewersCount` (int), `previewImageURL`. Hard cap `limit` ≤ 30 per call.
  - **Sort pitfall (fixed 2026-08-17)**: the server silently ignores `options.sort: "VIEWER_COUNT"` — verified by capturing the real browser request (identical body + `authorization: OAuth` + `client-integrity` header) which still returns RELEVANCE-ordered data. `VIEWER_COUNT_ASC` and `RECENT` do work server-side; `VIEWER_COUNT_DESC` is an invalid enum. Fix: `viewers`/`viewers-asc` are applied CLIENT-SIDE over the fetched page (semantics: "top N by viewers within the returned set"). If Twitch ever fixes the enum, the client-side sort still produces the same result.
- Page (for reference / fallback):
  - All channels: `https://www.twitch.tv/directory/all`; Category live tab: `https://www.twitch.tv/directory/category/{slug}/`
  - Sort via URL param: `?sort=RELEVANCE|VIEWER_COUNT|VIEWER_COUNT_ASC|RECENT`
  - Card container: `article`; Channel link: `a[data-a-target="preview-card-channel-link"]` (href `/login`, `h4[title]` = title); Game link (all-channels only): `a[data-a-target="preview-card-game-link"]`
  - Viewer count text: contains `名观众` (e.g. "直播9,631 名观众"; 万 = ×10000)
  - Thumbnail: `img` in `a[data-a-target="preview-card-image-link"]`, or derive `https://static-cdn.jtvnw.net/previews-ttv/live_user_{login}-640x360.jpg`
  - Language dialog: `button.tw-select-button` (text starts 语言) → `role="dialog"` with `<label>` options → Escape (verified in explore; unreliable in daemon — see Repair Clues)
  - Sort dropdown: `ul#browse-sort-drop-down-list`, options `li#browse-sort-drop-down-opt{0-3}` (recommended/viewers/viewers-asc/recent)

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled (WebSculpt daemon attaches via CDP). No Twitch login needed for public data.
- The in-page GraphQL fetch works from any page origin (gql.twitch.tv sends `access-control-allow-origin: *`); the command does not navigate.
- Anonymous cap: ~30–34 cards. Cursor pagination is blocked by Twitch's integrity challenge (`IntegrityCheckFailed`); GraphQL `limit` is hard-capped at 30 per call, so one page only.
- Polite pacing: the command spaces retries (800ms × attempt); keep pacing gentle for any future interaction-based additions.

## Failure Signals

- `DRIFT_DETECTED` when the GraphQL call fails / returns an error (HTTP non-200, parse failure, or GraphQL `errors[]` — e.g. `IntegrityCheckFailed` on a page-2 attempt).
- `EMPTY_RESULT` when the GraphQL response has no `streams.edges` (e.g. an obscure category with nothing live).
- Runner-level: `BROWSER_ATTACH_REQUIRED` (remote debugging off / first-attach consent popup not accepted), `DAEMON_BUSY`, `COMMAND_TIMEOUT`.

## Repair Clues

- **Sort**: if Twitch ever starts honoring `VIEWER_COUNT` server-side (or renames the enum), the client-side sort in `command.js` is still correct — it only reorders the same fetched nodes. If a "top N by viewers" across more than the one page is ever required, that needs solving the integrity challenge (browser request carries a `client-integrity` header obtained from gql.twitch.tv/integrity; the token is device/session-bound and expires).
- If `BrowsePage_Popular` / `DirectoryPage_Game` hashes change or the API starts requiring auth, capture the new persisted-query hash from the page's network log (POST to gql.twitch.tv/gql) and update `HASH_POPULAR` / `HASH_GAME`.
- DOM fallback: if GraphQL is blocked entirely, scrape the page instead — navigate to `/directory/all` or `/directory/category/{slug}/` with the `?sort=` URL param, wait for `a[data-a-target="preview-card-channel-link"]`, extract via `article` + `preview-card-game-link` + the `名观众` text (parse 万 ×10000), and derive the thumbnail URL from the channel login.
- Language dialog fallback (if a DOM-only path is ever required): click `button.tw-select-button` (text 语言), select the `<label>` whose text equals the Chinese display name, press Escape. Note: in the daemon, scripted clicks opened a zero-sized ReactModal and did not register reliably; prefer the GraphQL `broadcasterLanguages` route.
- Viewer text is Chinese-UI specific (`名观众`); an English-UI fallback would need a different matcher.

