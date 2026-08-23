# Context

## Precipitation Background (Why This Command Exists)

Kickstarter projects are protected by a challenge page: a plain Node HTTP client (node:https and global fetch) is blocked 100% (403), and alternate client approaches became blocked after a short window. Only a real Chrome browser passes. The project detail (funding stats, story, risks, rewards, tags, creator, counts) is scattered across the page-embedded `window.current_project.data` object and GraphQL `/graph` queries, so a browser-runtime command that combines both is the reliable way to fetch full project detail on demand.

## Value Assessment

- Replaces manual browser navigation + DevTools digging for any project detail lookup.
- Covers the common "check this campaign" need: funding progress, story, risks, reward tiers, creator, comment/update tabs.
- Generalizes across all project states (live/successful/failed/cancelled/upcoming) — `window.current_project.data` exists for all of them.
- Distinct from existing `kickstarter/search` (search/discover).

## Page Structure

- Page: `https://www.kickstarter.com/projects/{creator}/{slug}` (also accessible as `creator/slug`).
- `window.current_project.data` — main source (46+ keys): id (numeric pid), name, slug, blurb, state, goal, pledged, backers_count, usd_pledged, currency, fx_rate, launched_at, deadline, created_at, updated_at, state_changed_at, creator{id,name,slug,avatar,urls}, location{id,name,displayable_name,country,state,type}, category{id,analytics_name(English),name(localized),slug,parent_id,parent_name}, tags (string[]), rewards[], add_ons[], photo, video, comments_count, updates_count, urls.web.project.
- Story/risks are NOT in current_project.data. Fetch via `POST /graph` Campaign query: `project(slug:$slug){ id, risks, story(assetWidth:680), storyRteVersion, currency }`.
- Comments: `POST /graph` CommentsQuery. `commentableId` = **base64("Project-" + numeric pid)** (e.g. `Project-673793231` → `UHJvamVjdC02NzM3OTMyMzE=`). Build with `Buffer.from("Project-" + pid).toString("base64")`. Query: `commentable: node(id:$commentableId){ ... on Commentable { commentsCount, comments(first,last,after,before){ edges{node{...}}, pageInfo{...} } } }`.
- Updates: `POST /graph` PostsFeed. `project(slug:$projectSlug){ timeline(first:$first, after:$cursor){ totalCount, pageInfo, edges{node{type,timestamp,data{...}} } } }`. `project(slug:)` accepts both pure slug and `creator/slug`.
- Stats: `GET /projects/{creator}/{slug}/stats.json?v=1` → `{project:{state, backers_count, pledged(string), comments_count, comments_for_display_count}}`.
- CSRF token: `<meta name="csrf-token" content="...">` on the project page. Every `/graph` POST needs header `X-CSRF-Token: <token>` + `Content-Type: application/json`. Referer not required. Same-origin fetch auto-includes the session cookie.

## Environment Dependencies

- Requires a browser session via websculpt daemon attach to the user's Chrome (remote debugging enabled; first attach may need the user to click the "allow remote debugging" consent popup).
- No login required (all core fields are anonymous). If the Chrome is logged into Kickstarter, GraphQL `me`/personalized fields are included in responses but not used by this command.
- Polite pacing: the command does one random gentle scroll; the page itself fires its own /graph + stats.json calls. No 429 observed.
- The daemon must not be restarted; this command attaches via the shared daemon.

## Failure Signals

- NOT_FOUND: `window.current_project` undefined + title contains "The page you were looking for doesn't exist (404)".
- PLATFORM_BLOCKED: title/body matches `just a moment|cf-chl|challenges.cloudflare|security verification`; or `/graph` response is non-JSON HTML (Cloudflare challenge).
- DRIFT_DETECTED: `current_project.data` missing on non-404 page; csrf-token meta missing; GraphQL `errors` array present (Kickstarter GraphQL is strict — trimmed queries return field-level errors like `Field 'pageInfo' doesn't exist on type 'CommentEdge'`, `Variable $replyCursor is declared ... but not used`). Keep queries verbatim.
- If comments/updates return no data (commentsCount 0 / empty timeline), that is a valid empty result, not an error.

## Repair Clues

- If the GraphQL schema changes: capture the exact query text the page itself sends — click the Comments/Updates tab in DevTools Network and copy the `POST /graph` request body; replace the query constants in command.js.
- If `window.current_project` layout changes: fall back to `current_project.data` keys still present, or read the `data` JSON via `page.evaluate(() => window.current_project.data)` and re-map.
- Backup entry: `stats.json?v=1` gives live counts; the `Campaign` GraphQL query gives story/risks independently of the page DOM.
