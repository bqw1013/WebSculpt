# Evidence: github/get-repo

This document records the research and validation evidence for the `github/get-repo` command.

## Exploration Path

Command library check: `websculpt command domains` -> github domain; `websculpt command list github` -> only `github/get-trending` (node runtime, Search-API approximation). No existing command covers repository details, so this command is new.

Explored with `@playwright/cli` in an attached browser session; the exploration record passed `websculpt explore assess` (status: passed, capture eligible: yes).

## Verified URLs

- `https://github.com/facebook/react` — main repository page, verified via curl (HTTP 200, SSR embeddedData) and browser hydration. All extraction anchors verified here.
- `https://github.com/octocat/Hello-World` — edge-case repository (no website, no topics, no license), verified via curl: fields can be null/empty, structure consistent.
- `https://github.com/this-repo-does-not-exist-8x7/definitely-not-here` — non-existent repository, HTTP 404, `<title>Page not found · GitHub · GitHub</title>`, no embeddedData. NOT_FOUND detection basis.

## Structural Evidence

The repository page SSR embeds a `<script type="application/json" data-target="react-app.embeddedData">` JSON. Stable paths (verified 2026-08-09):

```
react-app.embeddedData.payload
├─ codeViewLayoutRoute.repo   { id, defaultBranch, name, ownerLogin, createdAt, ownerAvatar, public, isOrgOwned }
├─ sidebarAbout               { description, website, topics[{name}], stargazerCount, watcherCount, forksCount,
│                                repo:{ ownerAvatarUrl, ownerId, isArchived, license:{spdxId,name} },
│                                ownerLogin, repoName }
└─ codeViewRepoRoute.overview
   ├─ codeButton.local.protocolInfo  { httpUrl, sshUrl (null when anonymous), ghCliUrl }
   └─ overviewFiles[].richText       # rendered README HTML (SSR present; convert with DOMParser -> innerText)
```

Fields from embeddedData (most stable, no hydration needed): full_name, description, homepage, owner{login,avatar_url}, clone_url (HTTPS), ssh_url (logged-in only; null anonymous), stars, forks, watchers, license, topics, archived, default_branch, created_at, README text.

Hydration-only fields (must be read from DOM after hydration):
- primary language: `h2` with text `Languages` -> within its container, first `span[aria-label]` shaped `JavaScript: 49.5%`; take text before `:`.
- open_issues: nav link `a[href="/{owner}/{repo}/issues"]`; innerText regex `/Issues?\s+([\d,.]+[kKmM]?)/` -> e.g. `810`.
- pushed_at/updated_at (approximation): first `relative-time[datetime]` on the page, located in the `Latest commit ... · History N Commits` header line. GitHub repo page does not show independent updated/pushed timestamps; created_at is the exact embeddedData value.
- README: current UI has NO `#readme` anchor (`document.querySelector('#readme')` is null); README renders as `article.markdown-body`. Most stable source is embeddedData `overviewFiles[0].richText` (SSR, available regardless of scroll).

NOT_FOUND: HTTP 404 and/or title contains `Page not found` and/or embeddedData absent.

## Failure Signals

- 404 page: HTTP 404, `<title>Page not found · GitHub · GitHub</title>`, no `react-app.embeddedData`. Detect before waiting for normal selectors.
- Language section may be a skeleton until hydration; if absent (e.g., no languages), return null.
- Repos without description/website/topics/license yield null/empty values (octocat/Hello-World verified).
- created_at in browser embeddedData is timezone-localized (e.g., `2013-05-25T00:15:54.000+08:00`); normalize to UTC ISO in output.
- ssh_url is account-specific (e.g., `org-XXXXXXX@github.com:react/react.git`) when logged in, null when anonymous.
- Rate awareness: GitHub is rate-limit sensitive. Keep requests low; random waits between operations; no bursts. Observed no 429/403/CAPTCHA during exploration.

## Capture Assessment

Captured as `github/get-repo`. The path is verified and reproducible: embeddedData for bulk metadata + a small hydrated-DOM read for language/open_issues/dates. Browser runtime is required because node/curl only receives SSR embeddedData and misses language, open_issues, ssh_url and dates (they are hydration/DOM-only). No GitHub REST API used, so no API quota limits.
