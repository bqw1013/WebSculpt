# Evidence: github/list-commits

This document records the research and validation evidence for the `github/list-commits` command.

## Exploration Path

- Command library check: `websculpt command domains` lists 17 domains including `github`; `websculpt command list github` returns only `github/get-trending` (node runtime, no browser). No existing list-commits command — this is a new command.
- The explore workspace trace passed `explore assess` (status: passed, capture eligible: yes).
- Runtime contract consulted: browser-contract.md (browser runtime).
- Tools used: curl (SSR structure, ~8 requests, no 429/403); playwright-cli browser attach (own tab created/verified/closed, detached).

## Verified URLs

- https://github.com/react/react/commits — default branch (main), 35 commits first page
- https://github.com/react/react/commits/main — explicit main branch, 35 commits
- https://github.com/react/react/commits?after=2042572329425f9ebf35ae6287ea5bab72b2c497+34 — page 2 (35 commits, next offset +69, prev ?before=...)
- https://github.com/react/react/commits/19.1 — non-existent branch (negative: currentOid null, 0 commits)
- https://github.com/react/react/commits/stable — non-existent branch (negative: currentOid null, 0 commits)
- https://github.com/react/react/commits/deferred_commit_data/main?original_branch=main — enrichment endpoint (metadata for the current 35, NOT pagination)
- https://github.com/octocat/Hello-World/commits/master — small repo positive (3 commits, defaultBranch master)
- https://github.com/facebook/react/commits/main — 301 redirect to react/react (repo renamed)
- https://github.com/this-owner-definitely-not-exist/definitely-not-a-repo/commits/main — repo not found (HTTP 404, no embeddedData)
- Re-verified 2026-08-23 (post route-key drift): https://github.com/react/react/commits (commitsRoute, 35), https://github.com/react/react/commits/main (commitsRefRoute, 35), https://github.com/react/react/commits?after=055705ca01766d2a4379261b05e7990a849bdedc+34 (commitsRoute, 35, next +69), https://github.com/react/react/commits/definitely-not-a-branch-xyz (commitsRefRoute, 0 commits, currentOid null), https://github.com/octocat/Hello-World/commits/master (commitsRefRoute, 3, no next)

## Structural Evidence

- Commits page is SSR. Primary data source: `<script type="application/json" data-target="react-app.embeddedData">`. The commit data is now wrapped one level deeper inside a route object, re-verified 2026-08-23:
  - `payload.commitsRoute` — used when the URL has no ref in the path (`/commits` or paginated `/commits?after=...`).
  - `payload.commitsRefRoute` — used when the URL carries an explicit ref (`/commits/{branch}`), including non-existent branches.
  - Both route objects share the same shape: `commitGroups`, `repo`, `refInfo`, `currentCommit`, `filters`, `metadata`, `timedOutMessage`, `userNameDisplayConfiguration`.
  - Commit data lives at `payload.<route>.commitGroups[]`; repo facts at `payload.<route>.repo` (name/ownerLogin/defaultBranch); branch facts at `payload.<route>.refInfo` (name/currentOid).
  - If both route keys are absent from a parsed payload, the page structure has drifted again (DRIFT_DETECTED).
- Each page renders exactly 35 commits, date-grouped by `title` (e.g. "Aug 8, 2026").
- Commit object fields (verified real sample from react/react main):
  - `oid`: full 40-char SHA (e.g. "2042572329425f9ebf35ae6287ea5bab72b2c497")
  - `url`: relative commit URL (e.g. "/react/react/commit/2042572329425f9ebf35ae6287ea5bab72b2c497")
  - `authoredDate`: ISO 8601 with timezone offset (e.g. "2026-08-07T22:31:46.000-04:00")
  - `committedDate`: ISO 8601
  - `shortMessage`: first-line commit message (e.g. "Add `onBrowserBailout` Fizz option (#37193)")
  - `authors[]`: `login`, `displayName`, `avatarUrl`, `path`
- Default branch: `payload.<route>.repo.defaultBranch` (react/react = "main"). Current shown branch: `payload.<route>.refInfo.name`.
- Pagination: `a[rel="next"]` href e.g. "/react/react/commits?after={first_oid}+34"; offset increments by 35 each page (34, 69, ...). `a[rel="prev"]` uses `?before={oid}+35`. Scrolling does NOT auto-load more (verified in browser: 35 -> 35 rows).
- Repo rename redirect: facebook/react -> react/react (HTTP 301). Final owner/repo available as `payload.<route>.repo.ownerLogin` / `payload.<route>.repo.name`.
- DOM fallback selectors: `li[data-testid="commit-row-item"]` with `data-commit-link` attribute (full SHA); `relative-time[datetime]` (authored time); `img[data-testid="github-avatar"]` (alt=login, src=avatar); `h4 a` (message); branch selector `button[aria-label="{branch} branch"]`.
- Real extracted sample (react/react main, first 2): sha 2042572329425f9ebf35ae6287ea5bab72b2c497, message "Add `onBrowserBailout` Fizz option (#37193)", author gnoff, avatar https://avatars.githubusercontent.com/u/2716369?v=4, authored_at 2026-08-07T22:31:46.000-04:00; sha ec61f187fe39b0aa8ec6b508f2553b2047dc30cc, message "DevTools: Fix nested HOC name extraction in extractHOCNames (#37215)", author Biki-das.

## Failure Signals

- Repository not found: HTTP 404, page title "Page not found", no embeddedData script -> NOT_FOUND.
- Branch not found: HTTP 200, embeddedData present but `payload.commitGroups` empty and `payload.refInfo.currentOid` null (a Git branch always points to a commit) -> NOT_FOUND.
- Empty repository (no branch specified): currentOid null -> EMPTY_RESULT.
- Structure drift: embeddedData script missing while not a 404 -> DRIFT_DETECTED.
- No 429/403/CAPTCHA observed during explore (curl + browser). Rate-aware pacing built into the command (random waits, scroll, mouse move).

## Capture Assessment

This command should be captured. The path is verified with first-hand data (curl SSR + real browser), the extraction is stable (SSR embedded JSON, not fragile DOM), request-efficient (1 request for limit ≤ 35; pagination via the page's own Next cursor for higher limits), and broadly reusable (any public repo's commit history). Contract was presented to the user and confirmed on 2026-08-09, with authorization to prefer the most stable / least-request implementation (SSR embeddedData primary + cursor pagination).
