# Context

## Precipitation Background (Why This Command Exists)

GitHub's REST API is rate-limited for anonymous use (60 req/hr) and the previous `github/get-trending` relied on the Search API (10 req/min) which is easily exhausted under concurrency. The browser page is not subject to API quotas. Listing a user/org's repositories is a core discovery need and the upstream feeder for `github/get-repo`. Precipitated from a verified explore session.

## Value Assessment

- General: works for any GitHub user or org profile; 3 type filters x 4 sort orders x paginated limit.
- Reuse: feeds downstream `github/get-repo`, search candidates, portfolio scanning.
- Saves: avoids REST API quota errors and manual browser tab switching; one invocation returns a structured list.

## Page Structure

- User tab: `https://github.com/{user}?tab=repositories&type={all|source|fork|archived|mirror|template}&sort={updated|name|stargazers}`. List in `#user-repositories-list > li`. Card anchors: `a[itemprop="name codeRepository"]`, `p[itemprop="description"]`, `.f6.color-fg-muted.mt-2` metadata row, `a[href$="/stargazers"]`, `a[href$="/forks"]`, `relative-time[datetime]`, `.repo-language-color`. `li` class tokens `source|fork|archived` or `data-octo-dimensions` (`repository_is_fork`) give fork/archived flags.
- Org tab: `https://github.com/orgs/{org}/repositories?q={tokens}`. `?tab=repositories` 302-redirects for orgs to the bare profile. Filters/sort are `?q=` search tokens: Sources=`mirror:false fork:false archived:false`, Forks=`fork:true`, sort=`sort:stars|name|last-pushed`. Combined e.g. `?q=sort:stars mirror:false fork:false archived:false`. Card anchors: `li h4 a[href^="/{org}/"]`, `.repos-list-description`, `span[class*="PrimaryLanguageName"]`, `a[href$="/stargazers"]`, `a[href$="/forks"]`, `relative-time[datetime]`, `[data-listview-item-visibility-label]`.
- Pagination: both use `?page=N`, 30 repos/page.

## Environment Dependencies

- Browser runtime; daemon attaches to the user's running Chrome/Edge via CDP. No login required (`authRequired: not-required`).
- Rate awareness: random 200-700ms sleep between page navigations; pagination is serial; stops as soon as `limit` is reached. GitHub is sensitive to request bursts — if 429/403/CAPTCHA appears, slow down.

## Failure Signals

- `NOT_FOUND`: `document.title` contains "Page not found" (nonexistent user/org).
- `EMPTY_RESULT`: profile loads but no repo cards (`#user-repositories-list li` absent/empty on user tab; no `li h4 a[href^="/{user}/"]` on org tab).
- `DRIFT_DETECTED` candidate: if a valid profile page stops rendering the expected list anchors, extraction returns null → surfaces as `EMPTY_RESULT`; a maintainer should re-check selectors.
- Org 302 is expected, not an error: detect via `page.url()` lacking `tab=repositories` and re-navigate to `/orgs/`.

## Repair Clues

- If `#user-repositories-list` breaks on user pages, fall back to generic `.repo-list li` or `.Box-row` scan.
- If org CSS-module class names break, rely on stable anchors (`h4 a[href^="/{org}/"]`, `a[href$="/stargazers"]`, `relative-time`).
- If GitHub replaces the org `?q=` search syntax, re-verify left-nav link URLs on `/orgs/{org}/repositories`.
- Alternative data source: `https://api.github.com/users/{user}/repos?per_page=100` (rate-limited, last resort) or `https://github.com/search?q=user:{user}&type=repositories`.
