# Evidence: github/list-pulls

This document records the research and validation evidence for the `github/list-pulls` command.

## Exploration Path

- Command library checked: `websculpt command domains` and `websculpt command list github`. No existing pull-request list command; `github/list-pulls` is a new command. Closest relatives: `github/list-issues` (different data object), `github/get-pull` (single PR detail, downstream).
- Explore phase assessment passed (`status: passed`, `capture eligible: yes`).
- Verified path: `https://github.com/{owner}/{repo}/pulls` is SSR; PR list rendered directly in the DOM (`.js-issue-row`); no `react-app.embeddedData` for the list (unlike the commits page). `react-partial.embeddedData` only carries header/nav data. Fields added after hydration: comment count and review decision badge.

## Verified URLs

- https://github.com/react/react/pulls — default open tab, SSR DOM, 25 rows/page
- https://github.com/react/react/pulls?q=is%3Apr+is%3Aclosed — Closed tab (contains both unmerged-closed and merged PRs; measured 8 Closed + 17 Merged)
- https://github.com/react/react/pulls?q=is%3Apr+is%3Amerged — Merged tab (all rows merged; measured 25/25)
- https://github.com/react/react/pulls?q=is%3Apr — All tab (open/draft/closed/merged mixed)
- https://github.com/react/react/pulls?q=is%3Apr+is%3Aopen+sort%3Acreated-desc — created sort (Newest, matches default order)
- https://github.com/react/react/pulls?q=is%3Apr+is%3Aopen+sort%3Aupdated-desc — updated sort (Recently updated, different order)
- https://github.com/react/react/pulls?q=is%3Apr+is%3Aopen+sort%3Acomments-desc — comments sort (Most commented, comment counts rendered)
- https://github.com/react/react/pulls?page=2&q=is%3Apr — pagination (25/page; page 2 starts at #37217, page 1 ends at #37219)
- https://github.com/facebook/react/pulls — 301 redirect to https://github.com/react/react/pulls (repo rename)
- https://github.com/this-owner-definitely-not-exist-xyz/definitely-not-a-repo/pulls — 404 (NOT_FOUND signal)
- https://github.com/react/react/pulls?q=is%3Apr+is%3Aopen+label%3A%22no-such-label-xyz%22 — empty result (EMPTY_RESULT signal, 0 rows)
- https://github.com/octocat/Hello-World/pulls — small-repo positive case (25 open rows)

## Structural Evidence

URL mapping (verified):

| command enum | query | page behavior |
|---|---|---|
| state=open | `q=is:pr is:open` | Open tab (includes draft PRs) |
| state=closed | `q=is:pr is:closed` | Closed tab (includes both unmerged-closed AND merged PRs) |
| state=merged | `q=is:pr is:merged` | Merged tab (only merged PRs) |
| state=all | `q=is:pr` | all states mixed |
| sort=created | `sort:created-desc` | Newest (default) |
| sort=updated | `sort:updated-desc` | Recently updated |
| sort=comments | `sort:comments-desc` | Most commented |

Pagination: `?page=N` + `q`, 25 rows per page. Next link: `a[rel="next"]`.

Row container: `div.js-issue-row` (id like `issue_37251`).

Field selectors (verified on hydrated DOM):

- `number`: row `id` → `parseInt(id.replace('issue_',''))`
- `title` + `html_url`: `a[data-hovercard-type="pull_request"]` (text + href → `https://github.com` + href)
- `state`: `[aria-label$="Pull Request"]` on the state icon's wrapper span. Values: `Open Pull Request` / `Draft Pull Request` / `Closed Pull Request` / `Merged Pull Request`. Icon classes (auxiliary): open=`octicon-git-pull-request color-fg-open`; closed=`octicon-git-pull-request-closed color-fg-closed`; merged=`octicon-git-merge color-fg-done`.
- `author`: `span.opened-by a.Link--muted` textContent
- `labels`: `a.IssueLabel` textContent array (empty if none)
- `comments`: `a[aria-label$="comments"]` → parse the number from `aria-label`; element absent means 0 comments (rendered only after hydration, count >= 1)
- `review_decision`: `a[href*="partial-pull-merging"]` textContent. Measured values: `Review required` / `Approved` / `Changes requested` / `Draft` (draft PRs render "Draft" in this badge slot).
- `created_at` (open/draft only): `span.opened-by relative-time[datetime]` — the "opened" timestamp
- `closed_at` (closed only): same relative-time — "was closed" timestamp
- `merged_at` (merged only): same relative-time — "was merged" timestamp
- `draft`: true when aria-label is `Draft Pull Request` (draft PRs are a subtype of open)

NOT_FOUND signal: `document.title === "Page not found · GitHub"` OR absence of `#repo-content-pjax-container`. Repo renames follow via HTTP 301; effective owner/repo is read from the final page URL.

EMPTY_RESULT signal: 0 `.js-issue-row` rows (page shows "No results" text).

Rate awareness: random wait (250-600ms), small random scroll, random mouse move between page actions (best-effort, never fails the command). Single-page load measured ~2-4s (well under the 10s budget).

## Failure Signals

- 404 repo → HTTP 404, `document.title === "Page not found · GitHub"`, `#repo-content-pjax-container` absent → `NOT_FOUND`.
- Empty result → 0 `.js-issue-row` → `EMPTY_RESULT`.
- Structure drift: if `.js-issue-row` rows are absent AND the page is not a 404, throw `DRIFT_DETECTED` (GitHub changed the list markup).
- Comment count and review decision only appear after hydration; the command waits for rows plus a short hydration settle before extracting.
- Closed tab includes merged PRs; the per-item `state` field distinguishes them (documented in README).
- `created_at` is only present for open/draft items; closed/merged items expose only the closed/merged timestamp.

## Capture Assessment

The path is verified, reproducible, and parameterizable: repo/state/sort/limit map cleanly to a single page URL plus `?page=N` pagination. Data is public (no login). Browser runtime matches the requirement (browser session attaches to user Chrome; page reads avoid GitHub REST API rate limits). Capturing as `github/list-pulls` provides a reusable PR-list entry point and feeds `github/get-pull`.
