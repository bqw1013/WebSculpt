# Context

## Precipitation Background (Why This Command Exists)

Batch of GitHub browser-runtime commands. Gap: after getting a PR number (from list-pulls), users need the PR body, change sizes, mergeability, and file-change list. The public REST API is rate-limited (60 req/hr anonymous), so the command reads the rendered PR page and GitHub's own internal page_data endpoints instead.

## Value Assessment

Reusable for any GitHub public PR: reads body, state (open/closed/merged), merged/mergeable flags, labels, assignees, commit/change/review counts, dates, and optionally the changed-files list. High generality; feeds downstream tasks like code review triage, release notes, and CI merge checks. No API quota, so it is safe to call repeatedly (page access only).

## Page Structure

- PR conversation page: `https://github.com/{owner}/{repo}/pull/{number}` (a `facebook/react` alias 301-redirects to `react/react`; the browser follows it).
- SSR embedded data: `<script type="application/json" data-target="react-app.embeddedData">` -> `payload.pullRequestsLayoutRoute.pullRequest` (number, title, state OPEN/CLOSED/MERGED, author, baseBranch, headBranch, commitsCount, createdTime, closedTime, mergedTime, mergedBy) and `...repository` (ownerLogin, name).
- Hydration DOM:
  - body: `.js-command-palette-pull-body .js-comment-body` (innerText)
  - labels: `.js-issue-labels a[data-name]` -> `data-name`
  - assignees: `.js-issue-assignees a[data-hovercard-url]` -> regex `/users/([^/?]+)`
- GitHub's own internal JSON endpoints (require `X-Requested-With: XMLHttpRequest` header, else 406):
  - `/pull/{n}/page_data/tab_counts` -> filesChangedCount, checksCount
  - `/pull/{n}/page_data/diffstat` -> linesAdded, linesDeleted
  - `/pull/{n}/page_data/merge_box?merge_method=SQUASH&bypass_requirements=false` -> mergeStateStatus, numberOfCommits, isDraft, latestOpinionatedReviews[], mergeRequirements.conditions[] (PULL_REQUEST_MERGE_CONFLICT_STATE -> result PASSED/FAILED)
- include_files: `page.goto(prUrl + ".diff")` -> plain-text unified diff (redirects to patch-diff.githubusercontent.com). Parse per-file by `diff --git ` blocks: filename from `b/...`, status from `new file mode` / `deleted file mode` / `rename from|to` / `similarity index`, additions/deletions by counting `+`/`-` lines excluding `+++`/`---` headers.

## Environment Dependencies

- Browser runtime: attaches to the user's Chrome/Edge over CDP. First daemon connect may pop the OS "allow remote debugging" confirmation; if the command returns `BROWSER_ATTACH_REQUIRED`, check that remote debugging is on and that any confirmation dialog was accepted, then retry.
- No login required; a logged-in session yields richer merge-box branch-protection data but the core fields work anonymously.
- Polite pacing (policy): random waits (200-700ms) before/after navigation, random scroll + mouse move, no bursts. Target single-call time <= 10s; `include_files` adds one `.diff` navigation and is expected to be slightly slower.

## Failure Signals

- Non-existent PR number: `/pull/{n}` 301-redirects to `/issues/{n}` which 404s; title `Page not found`, no `pullRequestsLayoutRoute` in embeddedData. Detected before normal selectors (fail-fast).
- Non-existent repo: HTTP 404 with `Page not found` HTML.
- Rate limit / block: HTTP 429/403 -> NETWORK_ERROR, slow down.
- page_data endpoints return 406 without the `X-Requested-With` header; `.diff` cannot be fetched via fetch/XHR (must navigate). If all three page_data endpoints return null, throw NETWORK_ERROR.
- Hashed CSS-module class names in the new Files-changed UI (`.Diff-module__*`, `.MergeBox-module__*`) are unstable — never rely on them; use the page_data endpoints and the `.diff` text.
- embeddedData dates are timezone-localized (e.g. `+08:00`); normalize to UTC ISO.
- A PR body may contain literal URL-encoded text (`%0A`) if the author wrote it that way — return as-is.

## Repair Clues

- If embeddedData shape changes, re-inspect `payload.pullRequestsLayoutRoute` on a live PR page (curl the HTML or open in browser).
- If the merge box / page_data endpoints move, fall back to parsing the merge box DOM text (`[class*="MergeBox"]` innerText) for mergeable, and count timeline `.js-timeline-item` review events for reviews.
- If the `.diff` endpoint changes, the Files changed tab (`/pull/{n}/changes`) renders per-file headers with text like `path +N -M` / `Lines changed: X additions & Y deletions` — parseable, but hashed classes are unstable.
