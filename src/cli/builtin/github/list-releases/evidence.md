# Evidence: github/list-releases

This document records the research and validation evidence for the `github/list-releases` command.

## Exploration Path

Command library overlap check (`websculpt command list github`): only `github/get-trending` exists; no releases command present. This command is `new`, no conflict, no reuse.

The releases page `https://github.com/{owner}/{repo}/releases` was verified to be **pure SSR**: release entries are fully embedded in the initial HTML as `<section id="release-{tag}">` elements; no JS hydration required for the core fields. Assets are lazy-loaded via `expanded_assets` include-fragments; the endpoint `https://github.com/{owner}/{repo}/releases/expanded_assets/{tag}` is directly fetchable. Verification used anonymous curl (11 page GETs, HTTP 200/404 only, no 429/403/CAPTCHA observed).

## Verified URLs

- https://github.com/react/react/releases (SSR list, page 1; tag/name/published_at/body/html_url)
- https://github.com/react/react/releases?page=2 (pagination works, 10 sections per page)
- https://github.com/react/react/releases/expanded_assets/v19.2.8 (asset endpoint; Source code zip/tar.gz)
- https://github.com/gohugoio/hugo/releases (real binary assets, long bodies)
- https://github.com/gohugoio/hugo/releases/expanded_assets/v0.164.0 (38 assets; name/size/download_url structure)
- https://github.com/kubernetes/kubernetes/releases (Pre-release label sample: v1.37.0-rc.0)
- https://github.com/microsoft/vscode/releases (control sample: stable releases, no Pre-release label)
- https://github.com/octocat/Hello-World/releases (empty repo state -> EMPTY_RESULT)
- https://github.com/thisowner-does-not-exist-9z/releases (404 -> NOT_FOUND)

## Structural Evidence

Each release is a `<section id="release-{tag}" data-release-anchor="release-{tag}">`. Reliable selectors (verified from actual HTML):

| Field | Selector / source |
|---|---|
| `tag_name` | `section[id^="release-"]` id suffix, or tag link `a[href*="/releases/tag/"]` |
| `name` | `h2.sr-only` text (react: `19.2.8 (July 21st, 2026)`; hugo: `v0.164.0`) |
| `prerelease` | presence of `.Label` text `Pre-release` (class `Label--warning`) |
| `draft` | presence of `.Label` text `Draft` (only visible to privileged logged-in users; false when logged out) |
| `published_at` | first `relative-time[datetime]` in the section (ISO 8601, e.g. `2026-07-21T15:49:09Z`) |
| `body` | `[data-test-selector="body-content"]` / `.markdown-body` text content |
| `html_url` | `https://github.com/{owner}/{repo}/releases/tag/{tag}` |
| assets count | `span.Counter` (title attribute or text) |
| asset fragment | `include-fragment[src*="expanded_assets"]` -> `https://github.com/{owner}/{repo}/releases/expanded_assets/{tag}` |

Asset rows in the expanded_assets response: `li.Box-row`, each with `a[href]` (download_url), name in `a.Truncate-text`/link text, size as `[number] (KB|MB|GB|B)` text, and a `relative-time` publish date. GitHub no longer displays download counts in this UI; the contract uses `download_url` instead of `download_count`.

Pagination: `?page=N` returns the same SSR layout, 10 sections per page. Page 1 is the plain URL; pages 2+ append `?page=N`.

Error/empty states: 404 returns `<title>Page not found` and body text `Page not found`/`404`. Empty repo shows a `blankslate` with heading `There aren't any releases here`.

## Failure Signals

- 404 on a non-existent repository -> `NOT_FOUND` (detect `Page not found`).
- Empty repository (no releases) -> `EMPTY_RESULT` (detect `blankslate` + `releases here`).
- Asset fragment missing/failed to fetch -> return empty `assets` array for that release; do not fail the whole command.
- Rate awareness: possible 429/403/CAPTCHA under rapid repetition; command keeps requests modest (one page load + N same-origin asset fetches) and adds random waits between pagination pages.
- Structure drift: if `section[id^="release-"]` is absent on a normal page, treat as end-of-list; if absent on page 1 with no error state, surface as `DRIFT_DETECTED` or `EMPTY_RESULT` depending on blankslate presence.
- Invalid params (bad repo format, limit out of 1-100, non-numeric) -> `INVALID_PARAM` before any page access.

## Capture Assessment

This path should be captured as `github/list-releases`. It is a stable, high-value, frequently needed operation (listing a repo's releases with notes and assets), fully verified end-to-end from real GitHub pages. The page is SSR so extraction is deterministic, assets come from a stable same-origin endpoint, and error/empty states map cleanly to unified error codes. Runtime is `browser`; no login required.
