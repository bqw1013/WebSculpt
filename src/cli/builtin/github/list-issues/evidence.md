# Evidence: github/list-issues

This document records the research and validation evidence for the `github/list-issues` command.

## Exploration Path

- Explored and audited (`explore assess` passed; user confirmed the contract on 2026-08-09).
- Command library check: `websculpt command list github` shows existing github commands (get-trending, get-repo, list-repos, list-commits, list-releases, list-contributors). No `github/list-issues` — this is a new command, no conflict.
- Browser automation used Playwright CLI attached to the user's running Chrome. Data source validated in the hydrated page AND via the page's own GraphQL endpoint.

## Verified URLs

- https://github.com/facebook/react/issues (302 redirect to canonical react/react; renamed repo)
- https://github.com/react/react/issues (default open issues)
- https://github.com/react/react/issues?q=is%3Aissue+is%3Aclosed (closed)
- https://github.com/react/react/issues?q=is%3Aissue (all)
- https://github.com/react/react/issues?q=is%3Aissue+is%3Aopen+sort%3Acomments-desc (sort by comments)
- https://github.com/react/react/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc (sort by updated)
- https://github.com/react/react/issues?q=is%3Aissue+is%3Aclosed&page=2 (DOM pagination)
- https://github.com/torvalds/linux/issues (issues disabled → empty result)
- https://github.com/this-repo-not-exist-xyz/foo/issues (404 → NOT_FOUND)

## Structural Evidence

- The issues page is a React app. `react-app.embeddedData` payload contains only GraphQL query *variables* (`preloadedQueries[0].variables.query`), not the list data. The actual list data comes from the page's own GraphQL endpoint.
- **Primary data source: `GET https://github.com/_graphql?body=<urlencoded JSON>` (same-origin, no CSRF, no REST API quota).** Two persisted queries:
  - `IssueIndexPageQuery`, persisted hash `df0ca810f02c4fb3da828e125fc8b1a6`. Variables: `{ name, owner, query, showIssueFieldPills:true, skip, type:"ISSUE_HYBRID" }`. Response: `data.repository.search.edges[]`; each `node` has `number`, `titleHtml` (HTML), `state` (`OPEN`/`CLOSED`), `closed`, `closedAt`, `author.login`, `labels.edges[].node.name`, `createdAt`, `updatedAt`, `id` (node id).
  - `IssueRowSecondaryQuery`, persisted hash `5512751de579e84d892ad6aa594ba818`. Variables: `{ assigneePageSize:10, includeReactions:false, nodes:[nodeIds...] }`. Response: `data.nodes[]` each with `id` and `totalCommentsCount`. Merge with query 1 by node id to get `comments`.
- **State/sort mapping** (verified via query var `variables.query`):
  - state=open → `is:issue state:open` (default page) or `is:issue is:open`; closed → `is:issue is:closed`; all → `is:issue`.
  - sort=created → `sort:created-desc` (default); updated → `sort:updated-desc`; comments → `sort:comments-desc`.
  - Combined GraphQL query string: `is:issue is:{state} repo:{owner}/{repo} sort:{sort}-desc` (all → `is:issue` only).
  - URL: `https://github.com/{owner}/{repo}/issues?q=is%3Aissue+is%3A{state}[+sort%3A{sort}-desc]`.
- **Pagination**: GraphQL `skip` variable, 25 per page (`skip` 0/25/50/75). Verified skip=0 → numbers [37245,37243,37240], skip=25 → [37078,37074,37065], no overlap. DOM fallback: `?page=N`, 25/page, `a[rel="next"]`.
- **DOM selectors (fallback/hydration check)**: row title `a[data-testid="issue-pr-title-link"]` href `/react/react/issues/{number}`; state icon `[data-testid="list-row-state-icon"]` + `.sr-only` (`Status: Open.` / `Status: Closed (completed).` / `Status: Not planned (skipped).`); number `[data-testid="list-row-repo-name-and-number"]` (`#37245`); comments `[data-testid="list-row-comments"]` (text "515 comments" or empty for 0); labels `a[href*="issues?q=...label..."]` text; author + created `[data-testid="created-at"]`. NOTE: DOM relative-time `datetime` is ambiguous (updatedAt or closedAt on closed issues) and there is no updated_at in DOM — hence GraphQL is the authoritative source for created_at/updated_at.
- Canonical repo after redirect: read from `page.url()` after `goto` (`github.com/{owner}/{repo}/issues`).

## Failure Signals

- `NOT_FOUND`: nonexistent repo → `document.title` contains `Page not found`. Detected by title check after `goto`.
- `EMPTY_RESULT`: repo exists but no matching issues (including issues disabled, e.g. torvalds/linux) → GraphQL `search.edges` length 0.
- `NETWORK_ERROR`: GraphQL fetch fails, non-2xx, or `errors` array non-empty.
- `DRIFT_DETECTED` candidate: if `_graphql` response shape changes or persisted query hashes stop working, extraction fails; maintainer should re-verify the two persisted hashes and response paths. DOM selectors are a secondary fallback.
- Rate awareness: GitHub is sensitive to request bursts; keep per-command request count low (1 page load + 2 GraphQL fetches per 25-issue page), random sleeps between pages; 429/403/CAPTCHA means slow down.

## Capture Assessment

Capture is recommended. Listing a repository's issues with state/sort filters is a core, high-frequency discovery need and the upstream feeder for `github/get-issue`. The GraphQL path is the page's own data source (no REST API quota, complete created_at/updated_at/comments), verified end-to-end with real samples (25 issues, comments 0–515, ISO timestamps). Browser runtime is required to attach the user's session and reuse the same-origin cookies. No login required. Single-page default (limit≤25) completes well under 10s; limit=100 is 4 serial GraphQL pages.
