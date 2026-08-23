# Context

## Precipitation Background (Why This Command Exists)

Created during the batch of GitHub browser-runtime commands. Users need to survey a repository's pull requests (open / closed / merged / all, sorted by creation / update / comments) and pick PRs for review or downstream use. The GitHub REST API has tight anonymous rate limits, so the command reads the rendered `/pulls` page instead. Explore phase assessment passed.

## Value Assessment

- Reusable across any public GitHub repository; high-frequency workflow (review triage, PR scan, feeding `github/get-pull`).
- Replaces manual page-by-page browsing and avoids REST API rate limits.
- Output includes review decision (Approved / Changes requested / Review required) which is not available on the issues list page.

## Page Structure

- URL: `https://github.com/{owner}/{repo}/pulls?q={q}`, where `q = is:pr is:{state} sort:{token}`.
  - state → `is:open` / `is:closed` / `is:merged` / (all → nothing after `is:pr`).
  - sort → `sort:created-desc` / `sort:updated-desc` / `sort:comments-desc`.
- Pagination: `?page=N&q=...`, 25 PRs per page; next link `a[rel="next"]`.
- Row container: `div.js-issue-row` (id `issue_{number}`).
- Field selectors (verified):
  - title/href: `a[data-hovercard-type="pull_request"]`
  - state: `[aria-label$="Pull Request"]` → `Open Pull Request` / `Draft Pull Request` / `Closed Pull Request` / `Merged Pull Request`
  - author: `span.opened-by a.Link--muted`
  - labels: `a.IssueLabel`
  - comments: `a[aria-label$="comments"]` (absent = 0; hydrated after SSR)
  - review decision: `a[href*="partial-pull-merging"]`
  - timestamp: `span.opened-by relative-time[datetime]` (open → opened date; closed → closed date; merged → merged date)

## Environment Dependencies

- Browser runtime: daemon attaches to user's Chrome/Edge via CDP (independent of explore-phase `@playwright/cli` attach). Public data, no login required.
- Rate awareness: built-in `humanize()` (random wait 250-600ms, random scroll, random mouse move) runs after every navigation; never fails the command.
- Network: in the browser runtime the Chrome process handles networking, so the daemon's own network path does not matter; if any Node-side `fetch` is ever added it must confirm network/proxy reachability first.
- Comment counts and review decisions appear only after client-side hydration; the command waits for the `batch-deferred-content` skeleton to disappear (or a 6s timeout) before extracting.

## Failure Signals

- 404 repo: `document.title === "Page not found · GitHub"` or missing `#repo-content-pjax-container` → `NOT_FOUND`.
- Empty result: 0 `div.js-issue-row` + empty-state text ("No results" / "no pull requests") → `EMPTY_RESULT`.
- Structure drift: 0 rows without an empty-state marker → `DRIFT_DETECTED` (GitHub changed the list markup).
- Rate limiting / CAPTCHA: if 429/403/CAPTCHA appear, slow down (larger random waits) and re-test.

## Repair Clues

- If `.js-issue-row` stops matching, GitHub likely changed the list UI. Fallback: snapshot the page and re-derive the row/field selectors; the `q=` URL mapping (state/sort/pagination) is expected to remain stable.
- If `a[aria-label$="comments"]` changes, comment counts degrade to 0 (data would be wrong) — verify against a PR known to have comments.
- If `batch-deferred-content` hydration changes, review decisions degrade to `null` — acceptable but re-verify.
- Repo renames follow redirects; effective repo is parsed from `page.url()`.
