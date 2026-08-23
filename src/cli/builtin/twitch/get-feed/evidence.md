# Evidence: twitch/get-feed

This document records the research and validation evidence for the `twitch/get-feed` command.

## Exploration Path

- Command library check: `websculpt command list twitch` → existing `twitch/search` (browser, no login). No existing live-feed command; this is a new candidate.
- Browser automation guide: read the browser automation guide before using `@playwright/cli`; recorded in the explore trace Protocol.
- Explore workspace: a prior explore workspace (assess passed; Confirmation recorded 2026-08-17). Path verified with `@playwright/cli` 0.1.13 attached to user Chrome (CDP), Chinese UI.
- Runtime probe: Node https direct calls to `https://gql.twitch.tv/gql` (public Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko`, APQ persisted queries).

## Verified URLs

- `https://www.twitch.tv/directory/all` — All-live-channels grid; anonymous DOM shows 34 cards; sort dropdown (4 options) and language filter menu (34 options) verified.
- `https://www.twitch.tv/directory/category/league-of-legends/` — Category live tab; 4 tabs; same 34-card anonymous cap; cards omit the game link (category fixed).
- `https://gql.twitch.tv/gql` — Internal GraphQL; operations `BrowsePage_Popular` (hash `97fed6737c9ef90e8552fb7d02bf4e5d20da0af3cad2a5492d9c93f94e95c29e`) and `DirectoryPage_Game` (hash `86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd`) captured and parsed.

## Structural Evidence

- **Card container**: `article`. Card count on anonymous `/directory/all` = 34 (30 main grid + international sections).
- **Channel link**: `a[data-a-target="preview-card-channel-link"]`, `href="/{login}"`. Contains `h4[title="{stream title}"]` and `p[title="{login}"]`.
- **Game link** (all-channels only): `a[data-a-target="preview-card-game-link"]`, `href="/directory/category/{slug}"`, text = display name.
- **Viewer count**: text element inside `div.ScWrapper-sc-1wvuch4-0` — e.g. `"直播9,631 名观众"` (a "直播"/live badge prefix plus the count). Parse with a regex `(\d[\d,]*) 名观众`.
- **Thumbnail**: `img` inside `a[data-a-target="preview-card-image-link"]`, `src` pattern `https://static-cdn.jtvnw.net/previews-ttv/live_user_{login}-640x360.jpg` (derivable from login).
- **Tags**: `button[data-a-target="{tagName}"]`, `aria-label="标签，{tagName}"` (not per-stream language; tags are arbitrary).
- **Sort dropdown**: sort button `aria-haspopup="listbox"`, text "为您推荐". Listbox `ul#browse-sort-drop-down-list`, options `li#browse-sort-drop-down-opt{0-3}`. Four options verified:
  - 为您推荐 (For You) → `sort=RELEVANCE` → `recommended` (default)
  - 观众人数（高到低）(viewers high→low) → `sort=VIEWER_COUNT` → `viewers`
  - 观众人数（低到高）(viewers low→high) → `sort=VIEWER_COUNT_ASC` → `viewers-asc`
  - 最近开始 (recently started) → `sort=RECENT` → `recent`
- **Language filter**: button `button.tw-select-button` (aria-haspopup), opens `role="dialog"` with 34 `<label>` options + "清除全部" (clear all). Verified 34 languages, mapped to Twitch GraphQL `broadcasterLanguages` codes: `zh en id ca da de es fr it hu nl no pl pt ro sk fi sv tl vi tr cs el bg ru uk ar ms hi th ja ko asl other`. Selecting a language updates state client-side (no URL change) and re-queries GraphQL (e.g. 中文 → cards 34→30).
- **GraphQL request shape**: POST JSON array (batched), APQ `extensions.persistedQuery.sha256Hash`, `Content-Type: text/plain;charset=UTF-8`, header `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko`. Browser requests also carry `authorization: OAuth ...`, `x-device-id`, `client-version`, `client-session-id`.
- **GraphQL `BrowsePage_Popular`** (all-channels grid): variables `{ imageWidth:50, limit:30, platformType:"all", options:{ includeRestricted:["SUB_ONLY_LIVE"], sort:"RELEVANCE", freeformTags:null, tags:[], recommendationsContext:{platform:"web"}, requestID:"JIRA-VXP-2397", broadcasterLanguages:[] }, sortTypeIsRecency:false, includeCostreaming:true }`. Response `data.streams.edges[]` (each `cursor` + `node`), `pageInfo.hasNextPage`.
- **GraphQL `DirectoryPage_Game`** (category grid): same node shape; variables include `slug`; response `data.game.streams.edges[]`.
- **Stream node fields**: `id, title, viewersCount(int), previewImageURL, type:"live", broadcaster{id,login,displayName,profileImageURL}, game{id,name,displayName,slug}, freeformTags[{name}], curatedTags`. No per-stream language field.
- **Anonymous pagination cap**: DOM first screen 34 cards, no "显示更多" button in the grid (only side-nav). GraphQL single page hard limit = 30 (`argument 'first' value must be between 1 and 30` for limit>30). Cursor page-2 returns `IntegrityCheckFailed` (challenge type=integrity) for: node no-auth, node with OAuth, node with full headers, and in-page fetch with full headers. → effective anonymous cap ≈ 30–34; `partial:true` beyond.

## Failure Signals

- **`IntegrityCheckFailed`** on cursor pagination (challenge type=integrity). Unknown how the app solves it; login may raise the cap. Command must not rely on pagination beyond ~30.
- **GraphQL `argument 'first' value must be between 1 and 30`** if `limit` > 30 is sent in one call. Never send >30.
- **Anonymous frontend cap**: `/directory/all` and category pages render ~34 cards and hide the "显示更多" button. Do not expect a show-more button.
- **No per-stream language** in either GraphQL node or DOM; language is filter-input only.
- **Drift signals**: `article`, `preview-card-channel-link`, `preview-card-game-link`, viewer-count text (`N 名观众`), `tw-select-button`, `browse-sort-drop-down-list`, language dialog `role="dialog"` may change. If the card selector returns 0 matches → `DRIFT_DETECTED`.
- **Infrastructure**: `BROWSER_ATTACH_REQUIRED` if Chrome remote debugging is not enabled or the first-attach consent popup is not accepted; `DAEMON_BUSY`, `COMMAND_TIMEOUT` are runner-level.
- **Rate limiting**: Node direct bursts (5 rapid + 8 sequential) all returned 200 with no 429 in the probe session; still keep polite pacing (random delays 200–800 ms, small mouse moves).

## Capture Assessment

- Capture as `twitch/get-feed`: answers "what's live now / which channels are streaming this game" — Twitch's core browse scenario that `twitch/search` (keyword-only) cannot cover.
- Path fully verified: DOM selectors, sort/language filter options, GraphQL operations and hashes, anonymous caps. Output contract confirmed by user (2026-08-17).
- Browser runtime chosen because anonymous cursor pagination is blocked by the integrity challenge (node can only fetch a single 30-item page, insufficient for `limit` 1–100). Return `partial:true` when the grid is exhausted.
- **Implementation basis: in-page GraphQL fetch** (`BrowsePage_Popular` for all-channels, `DirectoryPage_Game` for category) — the same proven pattern as the existing `twitch/search` command. One page only (max 30 nodes), because cursor page-2 is blocked by `IntegrityCheckFailed`. Language filtering via `options.broadcasterLanguages`, sort via `options.sort`.
  - The DOM language-filter dialog (click `button.tw-select-button` → select `<label>` → Escape) was verified in explore but proved unreliable in the daemon (scripted click opens a zero-sized ReactModal), so it is documented in context.md as a fallback/repair clue rather than the primary path.
- Reuse value high: the live-channel grid is the entry point for the whole Twitch browse flow.
