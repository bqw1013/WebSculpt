# Context

## Precipitation Background (Why This Command Exists)

Part of the WebSculpt GitHub command batch (browser runtime). Users frequently need a repo's release history: which tags were published, when, with what notes and downloadable assets. The GitHub REST API is anonymous-rate-limited (60 req/hr) and does not fit the concurrent use pattern; browsing the releases page is not API-quota-limited. The releases page is pure SSR, so extraction is deterministic.

## Value Assessment

High reuse: any repo's releases list is a common lookup (release cadence, latest version, asset links). Cheap to run (one page load + N small same-origin asset fetches). Complements the batch's `get-repo`, `list-issues`, `list-pulls`, and feeds downstream link-chasing (a release `html_url` can be opened via other commands).

## Page Structure

- `https://github.com/{owner}/{repo}/releases` — SSR. Each release is `section[id="release-{tag}"]`.
- Fields: tag_name (section id), name (`h2.sr-only`), draft/prerelease (`.Label` text `Draft`/`Pre-release`), published_at (first `relative-time[datetime]`), body (`[data-test-selector="body-content"]` / `.markdown-body`), html_url (tag link), asset count (`span.Counter`).
- Assets: lazy-loaded via `include-fragment[src*="expanded_assets"]` → `https://github.com/{owner}/{repo}/releases/expanded_assets/{tag}`. Response rows are `li.Box-row` with name, size (`3.61 KB` / `38.6 MB`), and download `href`.
- Pagination: `?page=N`, 10 sections per page.
- Empty repo: `blankslate` + `There aren't any releases here`.
- 404: title/body `Page not found`.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled (websculpt daemon connects via CDP). No login required.
- Rate awareness: the command adds random wait (180-500ms), random scroll and mouse move per page, and a pause between pagination pages; asset fetches are concurrency-capped at 4 with random batch pauses. Target ≤10s for a single page read; multi-page limits are slower.
- daemon attach is independent from explore-stage `@playwright/cli` attach; first connect may surface a Chrome "allow remote debugging" system dialog — retry after acknowledging it.
- Rate-limit observation (2026-08-09, browser session): 5 consecutive quick calls plus ~200 total github.com requests across the full test pass produced no 429/403/CAPTCHA. Interval calls are stable. The command's pacing (1 page load + N concurrency-capped asset fetches + random waits) is conservative enough for normal and moderate burst use.

## Failure Signals

- `section[id^="release-"]` missing on page 1 with no error state → likely page structure drift (inspect `Page not found` / blankslate; if absent, page may have changed).
- `Page not found` → `NOT_FOUND` (repo gone/renamed).
- `There aren't any releases here` → `EMPTY_RESULT`.
- Asset fragment fetch fails → empty `assets` array for that release (command still succeeds).
- 429/403/CAPTCHA from GitHub under rapid repetition → slow down; record observed throttle rhythm.

## Repair Clues

- If GitHub changes release section markup, re-verify `section[id^="release-"]`, `h2.sr-only`, `.Label`, `relative-time[datetime]`, `.markdown-body` on a live releases page and update selectors.
- If `expanded_assets` endpoint changes, fall back to reading asset rows directly from the page DOM after the lazy include-fragment loads (rows are `li.Box-row` inside each release section).
- GitHub user/repo names may contain dots/hyphens; keep the loose `owner/repo` regex.
