# Evidence: github/list-repos

This document records the research and validation evidence for the `github/list-repos` command.

## Exploration Path

- Library check: `websculpt command list github` shows only `github/get-trending` (node runtime, REST Search API approximation of trending). No `github/list-repos` exists; this command is new and does not conflict.
- Explored and audited (audit passed, user confirmed contract).
- Exploration method: curl for SSR structure (each URL/state fetched at most once), then Playwright CLI attached to the user's Chrome to verify DOM, interaction, and URL-param mapping. No 429/403/CAPTCHA was triggered during exploration (~25 navigations/evals with random 200-700ms sleeps).

## Verified URLs

- https://github.com/torvalds?tab=repositories
- https://github.com/sindresorhus?tab=repositories&type=source&sort=stargazers
- https://github.com/sindresorhus?tab=repositories&type=source&sort=name
- https://github.com/octocat?tab=repositories&type=source&sort=stargazers
- https://github.com/orgs/facebook/repositories
- https://github.com/orgs/facebook/repositories?q=fork:true
- https://github.com/orgs/facebook/repositories?q=sort:stars
- https://github.com/orgs/facebook/repositories?q=sort:stars+mirror:false+fork:false+archived:false
- https://github.com/orgs/facebook/repositories?page=2
- https://github.com/this-user-does-not-exist-xyz?tab=repositories (NOT_FOUND signal)

## Structural Evidence

### Dual path (user vs org)

- USER profile repos tab: `https://github.com/{user}?tab=repositories` loads directly and honors URL params `type` and `sort`. Type recognized values: `all|source|fork|archived|mirror|template` (NOT `owner`/`member`). Sort recognized values: `updated|name|stargazers` (NOT `created`). Pagination: `?page=N`, 30 repos/page. Verified Next href: `/sindresorhus?page=2&sort=stargazers&tab=repositories&type=source`.
- ORG: `https://github.com/{org}?tab=repositories` 302-redirects to the bare profile page (query stripped). Must use `https://github.com/orgs/{org}/repositories` instead. This page ignores `?type=`/`?sort=` params; filters and sort are encoded in the `?q=` search syntax (left-nav links):
  - Sources(自己创建): `?q=mirror:false fork:false archived:false`
  - Forks: `?q=fork:true`
  - Sort by stars: `?q=sort:stars` (also `sort:name`, `sort:last-pushed`, `sort:relevance`)
  - Combined: `?q=sort:stars mirror:false fork:false archived:false` (verified, 30 repos sorted by stars)
  - Pagination: `?page=N`, 30 repos/page (verified `?page=2` returns different repos).
- Org detection in command: after navigating to the user-tab URL, if `page.url()` no longer contains `tab=repositories` (redirected to base), treat as org and re-navigate to `/orgs/{user}/repositories`.

### User tab card DOM (`#user-repositories-list > li`, stable itemprop attributes)

```
<li class="... public source" itemprop="owns">          # class tokens: source|fork|archived
  <h3><a href="/sindresorhus/awesome" itemprop="name codeRepository">awesome</a>
      <span class="Label Label--secondary">Public</span></h3>
  <p itemprop="description">…description…</p>
  <div class="f6 color-fg-muted mt-2">                  # metadata row
    <a class="Link--muted" href="/sindresorhus/awesome/stargazers">★ 493,800</a>
    <a class="Link--muted" href="/sindresorhus/awesome/forks">⑂ 36,334</a>
    <span class="tmp-mr-3">©license</span>
    <span class="tmp-mr-3"><span class="repo-language-color" …></span>TypeScript</span>   # only if language present
    Updated <relative-time datetime="2026-06-30T18:21:16Z">Jul 1, 2026</relative-time>
  </div>
</li>
```

Stable anchors: `a[itemprop="name codeRepository"]`, `p[itemprop="description"]`, `.f6.color-fg-muted.mt-2`, `a[href$="/stargazers"]`, `a[href$="/forks"]`, `relative-time[datetime]`, `.repo-language-color`. Star/fork numbers are exact integers with thousands separators. Fork/archived flags come from the `li` class tokens (`source`/`fork`/`archived`) or `data-octo-dimensions` (`repository_is_fork:true`).

### Org tab card DOM (new GitHub list UI, hashed CSS-module classes — do not rely on class names)

```
<li class="ListItem-module__listItem__…" aria-label="docusaurus.">
  <h4><a class="Title-module__anchor__…" href="/facebook/docusaurus"><span>docusaurus</span></a></h4>
  <span data-listview-item-visibility-label="true">Public</span>          # visibility: Public/Archived/…
  <div class="repos-list-description …" title="…">…</div>
  <span class="ReposListItem-module__PrimaryLanguageName__…">TypeScript</span>
  <a href="/facebook/docusaurus/forks">⑂10k</a>    <a href="/facebook/docusaurus/stargazers">★66k</a>
  <a data-testid="issue-count">292</a>   <a data-testid="pull-request-count">126</a>
  <span>Updated <relative-time datetime="2026-08-07T21:10:56.582Z">Aug 7, 2026</relative-time></span>
</li>
```

Stable anchors (attribute/structure based, NOT class names): `li h4 a[href^="/{user}/"]` (name), `.repos-list-description` (description, prefer `title` attribute), `a[href$="/stargazers"]`, `a[href$="/forks"]`, `relative-time[datetime]`, `span[class*="PrimaryLanguageName"]` (language), `[data-listview-item-visibility-label]` (visibility/archived). Star/fork counts are abbreviated ("66k", "10k", "6.9k") — parse k/m suffixes as approximate (66k→66000, 6.9k→6900). Fork flag per-card is not reliably exposed; use the applied type filter (fork→true, owner→false) and/or text heuristic ("forked from").

### Common

- `relative-time[datetime]` gives the exact ISO-8601 timestamp shown as "Updated/Last pushed" (user tab: updated_at; org tab: last pushed). This is the only timestamp on the card.
- Cards do NOT expose `created_at`, `pushed_at`, or `default_branch` (verified: page body has no `created_at`; embedded JSON is only locale/nav). Per user-approved contract, the output schema omits these three fields.
- Abbreviation/exact parsing: `parseCount()` handles "493,800"→493800, "66k"→66000, "6.9k"→6900, "1.2m"→1200000.

### Extraction samples (from explore)

User (sindresorhus, type=source, sort=stargazers): `sindresorhus/awesome` stars=493800, forks=36334, no language, `updated_at=2026-06-30T18:21:16Z`.
Org (facebook, type=owner, sort=stars → `?q=sort:stars mirror:false fork:false archived:false`): `facebook/docusaurus` language=TypeScript, stars≈66000, forks≈10000, `updated_at=2026-08-07T21:10:56.582Z`; `facebook/rocksdb` C++, 32k/6.9k, etc.

## Failure Signals

- NOT_FOUND: nonexistent user/org → `document.title === "Page not found · GitHub"` (verified). Check title after each navigation.
- EMPTY_RESULT: page loads but no repo cards (e.g., user exists with zero repos matching type filter). Throw distinct error, not NOT_FOUND.
- DRIFT_DETECTED: expected container/anchors missing on a successfully-loaded profile page (e.g., `#user-repositories-list` absent on user tab, or no repo `li` found on org tab) → structure changed.
- Org 302: `?tab=repositories` on an org redirects to the bare profile; the command must detect (URL lacks `tab=repositories`) and re-navigate to `/orgs/{org}/repositories`. Not an error.
- Rate awareness: GitHub is sensitive to request bursts. Command must add random 200-700ms sleeps between page navigations; pagination must be serial; stop pagination early once `limit` is reached. If 429/403/CAPTCHA is observed, slow down and retry.
- No login required; `authRequired: not-required`.

## Capture Assessment

This command should be captured. The explore phase verified both the user-tab path (`?tab=repositories` with `type`/`sort` params) and the org path (`/orgs/{org}/repositories` with `?q=` search syntax), extracted real structured samples, confirmed pagination (`?page=N`, 30/page), and confirmed the NOT_FOUND/EMPTY_RESULT signals. It fills the core gap of listing a user/org's repositories, serves as the upstream feeder for `github/get-repo`, and is parameterizable (user/type/sort/limit) for reuse. Runtime is browser (client-rendered GitHub UI).
