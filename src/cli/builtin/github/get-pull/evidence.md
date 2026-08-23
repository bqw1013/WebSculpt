# Evidence: github/get-pull

This document records the research and validation evidence for the `github/get-pull` command.

## Exploration Path

Command library check: `websculpt command domains` -> github domain; `websculpt command list github` -> existing get-trending / get-repo / list-commits / list-contributors / list-releases / list-repos / list-issues / list-pulls. No existing command covers single pull request detail, so this command is new.

Explored with `@playwright/cli` attached to the user's Chrome. The explore workspace trace passed `websculpt explore assess` (status: passed, capture eligible: yes). Browser runtime contract read before implementing.

## Verified URLs

- `https://github.com/react/react/pull/37251` — open human PR, verified via curl (HTTP 200, SSR embeddedData) and browser hydration + internal page_data endpoints. Full extraction sample for all fields recorded in the explore trace.
- `https://github.com/react/react/pull/37215` — MERGED PR, verified: state=MERGED, closed_at/merged_at/merged_by, mergeBox `Pull request successfully merged and closed`, reviews=1 (latestOpinionatedReviews=[{author:hoxyq,state:APPROVED}]).
- `https://github.com/react/react/pull/37239` — CLOSED (unmerged) PR, verified: closed_at present, merged=false, mergeable=null, body literal `%0A` URL-encoded text.
- `https://github.com/react/react/pull/37211` — dependabot open PR, verified embeddedData open-state shape.
- `https://github.com/react/react/pull/37251.diff` and `pull/37215.diff` — plain-text `.diff` endpoints, verified via curl and browser page.goto (redirects to patch-diff.githubusercontent.com); per-file parse cross-validated with page_data totals.
- `https://github.com/react/react/pull/9999999` — non-existent PR number, verified: 301 redirect to `/issues/9999999`, HTTP 404, title `Page not found · GitHub`, no embeddedData (NOT_FOUND basis).
- `https://github.com/facebook/react/pull/37251` — repo alias redirect, verified: 301 to `react/react/pull/37251`, HTTP 200 (browser follows automatically).
- `https://github.com/this-repo-not-exist-8x7/definitely-not-here/pull/1` — non-existent repo, HTTP 404 (NOT_FOUND basis).

## Structural Evidence

The PR page SSR embeds `<script type="application/json" data-target="react-app.embeddedData">`. Stable path (verified 2026-08-09):

```
react-app.embeddedData.payload
└─ pullRequestsLayoutRoute
   ├─ pullRequest  { number, title, titleHtml, state ("OPEN"|"CLOSED"|"MERGED"), author:{login,displayName,avatarUrl},
   │                 baseBranch, headBranch, headSha, commitsCount, createdTime, closedTime, mergedTime,
   │                 mergedBy, mergedByName, headRepositoryOwnerLogin, headRepositoryName, relayId }
   └─ repository   { ownerLogin, name, defaultBranch }
```

Fields from embeddedData (no hydration needed): number, title, state, author, base_ref, head_ref, commits, created_at, closed_at, merged_at, merged_by, merged (= mergedTime != null), repo owner/name.

Fields NOT in embeddedData (need hydration DOM + internal page_data endpoints):
- body: DOM `.js-command-palette-pull-body .js-comment-body` innerText (inside rails-partial pullRequestsConversationsRoute.Body; SSR present but read from DOM after hydration).
- labels: DOM `.js-issue-labels a[data-name]` -> `data-name` attribute (verified `CLA Signed`; labels are NOT links to `/labels/`).
- assignees: DOM `.js-issue-assignees a[data-hovercard-url]` -> regex `/users/([^/?]+)`. react PRs rarely assign; empty state `No one assigned` verified.
- change sizes / mergeable / reviews / draft / checks: internal same-origin JSON endpoints (the page itself calls them on hydration). All require header `X-Requested-With: XMLHttpRequest` (plain fetch returns 406):
  - `GET /{owner}/{repo}/pull/{n}/page_data/tab_counts` -> `{"filesChangedCount":2,"checksCount":7,"conversationCount":0,...}` -> changed_files = filesChangedCount.
  - `GET /{owner}/{repo}/pull/{n}/page_data/diffstat` -> `{"diffstat":{"linesAdded":165,"linesDeleted":6,"linesChanged":171}}` -> additions/deletions.
  - `GET /{owner}/{repo}/pull/{n}/page_data/merge_box?merge_method=SQUASH&bypass_requirements=false` -> `pullRequest.mergeStateStatus`, `pullRequest.numberOfCommits`, `pullRequest.isDraft`, `pullRequest.latestOpinionatedReviews[]` (each {author:{login}, state: APPROVED|CHANGES_REQUESTED|COMMENTED}), `mergeRequirements.conditions[]` with `type==="PULL_REQUEST_MERGE_CONFLICT_STATE"` -> `result` (PASSED = no conflict). For open PRs the conflict condition is present; for closed/merged PRs it is absent (mergeable=null). reviews = latestOpinionatedReviews.length.

include_files file list: browser `page.goto(prUrl + ".diff")` (GitHub blocks XHR/fetch to `.diff`; navigation works, redirects to patch-diff.githubusercontent.com/raw/...). Read `document.body.innerText` (text/plain unified diff). Parse per file block split by `^diff --git `: filename from `diff --git a/.. b/..`, status from `new file mode` (added) / `deleted file mode` (deleted) / `rename from` or `similarity index` (renamed) / else modified; additions/deletions by counting `+`/`-` lines excluding `+++`/`---` headers. Verified: PR 37251 -> 2 files, total 165/6 = page_data diffstat; PR 37215 -> `new file mode` file parsed as added.

NOT_FOUND: `/pull/{n}` for a non-existent number redirects to `/issues/{n}` (HTTP 404, title `Page not found · GitHub`, no embeddedData); non-existent repo returns HTTP 404 directly. Detect by HTTP status 404, title match, or absence of `payload.pullRequestsLayoutRoute.pullRequest`.

## Failure Signals

- Non-existent PR number: 301 redirect `/pull/{n}` -> `/issues/{n}` then 404; title `Page not found`; no embeddedData. Fail fast before waiting for normal selectors.
- Non-existent repo: HTTP 404 with `Page not found` HTML; no embeddedData.
- Rate-limit/block: HTTP 429/403 -> return NETWORK_ERROR and slow down.
- page_data endpoints return 406 when called without `X-Requested-With: XMLHttpRequest` header; plain `fetch()` fails, must set the header.
- `.diff` endpoint cannot be fetched via XHR/fetch (TypeError: Failed to fetch); must use page navigation.
- New Files changed UI (`/changes`) uses hashed CSS-module class names (unstable) — do not rely on them; use the `.diff` plain-text endpoint for the file list.
- Dates in browser embeddedData are timezone-localized ISO (`2026-08-09T06:15:43+08:00`); normalize to UTC via `new Date(x).toISOString()`.
- PR body may contain literal URL-encoded text (`%0A`) if the author wrote it that way — not a bug, return as-is.
- Rate awareness: GitHub is rate-limit sensitive. Random waits between operations; no bursts. Observed no 429/403/CAPTCHA during exploration.

## Capture Assessment

Captured as `github/get-pull`. The path is verified and reproducible: embeddedData for base fields + page's own internal JSON endpoints (tab_counts/diffstat/merge_box) for change sizes/mergeable/reviews + small hydrated-DOM reads for body/labels/assignees + `.diff` plain-text parse for include_files. Browser runtime is required because these data sources only exist in a rendered browser session (page_data endpoints require session cookies and the `X-Requested-With` header; `.diff` needs page navigation). No GitHub REST API used, so no API quota limits.
