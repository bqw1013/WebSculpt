# Context

## Precipitation Background (Why This Command Exists)

GitHub's REST API is rate-limited for anonymous use (60 req/hr) and the Search API (10 req/min) is easily exhausted under concurrency; the browser page is not subject to API quotas. Listing a repository's issues is a core discovery need and the upstream feeder for `github/get-issue`. Precipitated from a verified explore session (audit passed, user confirmed 2026-08-09).

## Value Assessment

- General: works for any GitHub public repo; 3 state filters x 3 sort orders x paginated limit up to 100.
- Reuse: feeds downstream `github/get-issue`, triage/backlog scanning, popular-issue discovery (sort=comments).
- Saves: avoids REST API quota errors; one invocation returns a structured, deduplicated list with exact ISO created/updated timestamps and comment counts.

## Page Structure

- URL: `https://github.com/{owner}/{repo}/issues?q=is%3Aissue+is%3A{state}[+sort%3A{sort}-desc]` (open→`is:issue is:open`, closed→`is:issue is:closed`, all→`is:issue`; created→`sort:created-desc`, updated→`sort:updated-desc`, comments→`sort:comments-desc`).
- The page is a React app; `react-app.embeddedData` holds only query *variables*, not list data. The list data comes from the page's own GraphQL endpoint:
  - `GET /_graphql?body=<urlencoded JSON>`, same-origin, no CSRF, works anonymously.
  - `IssueIndexPageQuery` (persisted hash `df0ca810f02c4fb3da828e125fc8b1a6`), variables `{ name, owner, query, showIssueFieldPills:true, skip, type:"ISSUE_HYBRID" }` → `data.repository.search.edges[]`; node has `number`, `titleHtml`, `state` (OPEN/CLOSED), `author.login`, `labels.edges[].node.name`, `createdAt`, `updatedAt`, `id`.
  - `IssueRowSecondaryQuery` (persisted hash `5512751de579e84d892ad6aa594ba818`), variables `{ assigneePageSize:10, includeReactions:false, nodes:[ids] }` → `data.nodes[]` with `totalCommentsCount`; merge by node id.
- Pagination: GraphQL `skip` (0/25/50/75), 25 issues per page; stop when a page returns 0 or the first number repeats (GitHub clamps high skip).
- Renamed repos 302 to the canonical name (facebook/react → react/react); the command reads the canonical owner/repo from `page.url()` after `goto`.

## Environment Dependencies

- Browser runtime; daemon attaches to the user's running Chrome/Edge via CDP. No login required (`authRequired: not-required`).
- Rate awareness: random 200-700ms sleep between GraphQL page fetches; the page itself is loaded once. The command issues few requests (1 page load + 1 index query + 1 secondary query per 25-issue chunk), so it is efficient and unlikely to hit GitHub's rate limits. If 429/403/CAPTCHA appears, increase the sleep.

## Failure Signals

- `NOT_FOUND`: nonexistent repo → `document.title` contains "Page not found".
- `EMPTY_RESULT`: repo exists but GraphQL `search.edges` is empty (including issues-disabled repos like torvalds/linux).
- `NETWORK_ERROR`: GraphQL fetch non-2xx or `errors` payload.
- `DRIFT_DETECTED`: `_graphql` response no longer has `data.repository.search.edges` (query hash or shape changed).
- DOM fallback anchors (in case GraphQL is unavailable): `a[data-testid="issue-pr-title-link"]`, `[data-testid="list-row-state-icon"]` + `.sr-only` (`Status: Open.`/`Closed (completed).`/`Not planned (skipped).`), `[data-testid="list-row-repo-name-and-number"]` (`#37245`), `[data-testid="list-row-comments"]` ("515 comments"), labels `a[href*="issues?q=...label..."]`. Note the DOM does NOT expose updated_at, and its single `relative-time[datetime]` is ambiguous on closed issues (updatedAt or closedAt), so DOM is only a partial fallback.

## Repair Clues

- If `IssueIndexPageQuery`/`IssueRowSecondaryQuery` persisted hashes stop working, update them: load `https://github.com/{owner}/{repo}/issues` in a browser, open DevTools → Network, filter `_graphql`, copy the current `query` hash for each `persistedQueryName`.
- If the GraphQL response path changes, adjust `data.repository.search.edges` traversal; the node field names (`titleHtml`, `createdAt`, `updatedAt`, `totalCommentsCount`) are the keys to keep.
- Alternative data source (last resort, rate-limited): `https://api.github.com/repos/{owner}/{repo}/issues?state={state}&sort={sort}&per_page=100` (REST, 60/hr anonymous).
- The URL `?page=N` is the DOM pagination (25/page) and can drive a DOM-only fallback if GraphQL is ever unavailable.
