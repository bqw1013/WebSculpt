# Evidence: kickstarter/get-project

This document records the research and validation evidence for the `kickstarter/get-project` command.

## Exploration Path

- Command library check (`websculpt command list kickstarter`): only `kickstarter/search` existed; no get-project/discover/list-categories/get-creator. This command is `new`.
- Runtime decision: **browser**. A plain Node HTTP client (node:https and global fetch) is fully blocked by the challenge page (403, 5/5 retries); alternate client approaches were briefly working but became blocked too and are not a WebSculpt runtime. Real Chrome works: `page.goto(project_url)` loads the real page, in-page `fetch('/graph')` with `X-CSRF-Token` returns 200, in-page `fetch('/projects/.../stats.json?v=1')` returns 200. All three verified first-hand on two live projects (2026-08-20).

## Verified URLs

Verified URLs (verified-urls) used for extraction (all first-hand, 2026-08-20):
- `https://www.kickstarter.com/projects/wraithmarked/wmartbook` (live project; full `window.current_project.data` structure)
- `https://www.kickstarter.com/projects/mulsow/pontos` (second live project, generalization)
- `https://www.kickstarter.com/graph` (POST with X-CSRF-Token + Content-Type application/json; Campaign / CommentsQuery / PostsFeed all return 200 JSON)
- `https://www.kickstarter.com/projects/wraithmarked/wmartbook/stats.json?v=1` (real-time counts)
- `https://www.kickstarter.com/projects/zz-nonexistent-creator-zz/nonexistent-project-xyz` (404 signal: title "The page you were looking for doesn't exist (404)", `window.current_project` undefined)
- `https://www.kickstarter.com/` (curl observed Cloudflare managed challenge 403, corroborates browser-only)

## Structural Evidence

- Project page embeds `window.current_project` as `{ data: { ... } }`. All funding/reward/tag/creator/count fields live under `window.current_project.data` (46 keys observed on wmartbook: id, name, slug, blurb, state, goal, pledged, backers_count, usd_pledged, currency, fx_rate, launched_at, deadline, created_at, updated_at, state_changed_at, creator{id,name,slug,avatar,urls}, location{id,name,displayable_name,country,state,type}, category{id,analytics_name,slug,parent_id,parent_name}, tags(string[]), rewards[], add_ons[], photo, video, comments_count, updates_count, urls{web.project}, and more).
- NO `story`/`risks`/`faqs`/`percent_funded` keys in current_project.data. `percent_funded` is derived as `round(pledged/goal*100)`. `story` and `risks` must be fetched via GraphQL `Campaign` query.
- `POST /graph` accepts `[{operationName, variables, query}]` (array) or a single object; response mirrors as `[{data:{...}}]`. Requires `Content-Type: application/json` and `X-CSRF-Token` header (from `<meta name="csrf-token">`); missing token => 403. Referer not required. Cookie is sent automatically on same-origin fetch.
- GraphQL is strictly validated: hand-trimmed queries return field-level `errors` inside a 200 response (e.g. `Field 'pageInfo' doesn't exist on type 'CommentEdge'`, `Variable $replyCursor is declared by CommentsQuery but not used`). Use verbatim query text or consistent variable declarations.
- Comments tab query: `CommentsQuery`, variables `{commentableId, nextCursor, previousCursor, first, last}`. `commentableId` = base64(`Project-<numeric pid>`) where pid = `current_project.data.id` (e.g. `Project-673793231` => `UHJvamVjdC02NzM3OTMyMzE=`). Structure: `commentable: node(id:$commentableId) { ... on Commentable { commentsCount, comments(first,last,after,before){ edges{node{id,body,createdAt,parentId,author{name,url},replies(last:3){totalCount,nodes}}}, pageInfo{startCursor,endCursor,hasNextPage,hasPreviousPage} } } }`.
- Updates tab query: `PostsFeed`, variables `{projectSlug, cursor, first}`. Structure: `project(slug:$projectSlug){ timeline(first:$first, after:$cursor){ totalCount, pageInfo{hasNextPage,endCursor}, edges{node{type,timestamp,data{ ...on Postable{id,type,title,publishedAt,number,isPublic,likesCount} ...on FreeformPost{commentsCount(withReplies:true), body} }}} } }`. `project(slug:)` accepts both pure slug and `creator/slug`.
- Story/risks query: `Campaign` with `{slug}` => `project(slug:$slug){ id, risks, story(assetWidth:680), storyRteVersion, currency }`. `risks` is a text string; `story` is full HTML (pontos project: 19551 chars).
- `stats.json?v=1` returns `{"project":{"id":673793231,"state_changed_at":1786453251,"state":"live","backers_count":760,"pledged":"64305.0","comments_count":27,"comments_for_display_count":9}}` (pledged is a string; `comments_for_display_count` is the tab display count vs `comments_count` total).

## Failure Signals

- NOT_FOUND: `window.current_project` undefined + title contains "The page you were looking for doesn't exist (404)". Check existence BEFORE platform-block checks.
- PLATFORM_BLOCKED: Cloudflare challenge page (title "Just a moment...", `cf-chl`, `challenges.cloudflare.com`, body "Enable JavaScript and cookies to continue"); also `/graph` returning non-JSON HTML.
- DRIFT_DETECTED: `current_project.data` missing on a non-404 page; csrf-token meta missing; GraphQL field-level errors.
- Rate limiting: no 429 observed in browser (8+ /graph + 10+ stats.json calls on one page load, all 200).
- GraphQL strict validation: trimmed queries return field errors, not whole-package rejection.

## Capture Assessment

This command should be captured. Kickstarter's Cloudflare protection makes node/curl unusable; the browser path (real Chrome + in-page /graph + `window.current_project`) is fully verified first-hand on two live projects, produces complete structured output (funding stats, story, risks, rewards, tags, creator, counts), and covers optional comments/updates tabs. It is a distinct, reusable capability vs existing `kickstarter/search`. User confirmed the contract on 2026-08-20.
