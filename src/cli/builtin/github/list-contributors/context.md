# Context

## Precipitation Background (Why This Command Exists)

A common GitHub need is "who are the top contributors of this repo and how much did each contribute". The `github` domain previously had only `get-trending` (Search-API approximation), which does not cover contributor data. This command precipitates the verified path to the contributors chart page so callers can get a ranked contributor list in one call without hand-scraping.

## Value Assessment

- Generality: any public repository on GitHub (`/graphs/contributors` is available for all public repos).
- Reuse frequency: high — contributor ranking is a standard repo-health question (onboarding, credit, leaderboard, due-diligence).
- Time saved: avoids navigating a heavy JS chart page and re-deriving the embedded-data endpoint.

## Page Structure

- URL: `https://github.com/<owner>/<repo>/graphs/contributors`
- The page embeds a JSON bootstrap: `script[data-target="react-app.embeddedData"]`.
  - `payload.graphDataPath` → relative path of the internal data endpoint (e.g. `/react/react/graphs/contributors-data`).
  - `payload.repoUrl` → canonical repo URL (follows renames/redirects).
- Data endpoint (fetched with `Accept: application/json`): an array of `{ total, author: { login, avatar, path }, weeks: [...] }`, ascending by `total`.
  - `login` ← `author.login`; `avatar_url` ← `author.avatar`; `html_url` ← `"https://github.com" + author.path`; `contributions` ← `total`.
  - `total === sum(weeks[].c)` (commit count).
- The endpoint honors no `limit`/`per_page` param; it is a one-shot full dump capped at 500 entries. The command sorts descending by `total` and slices to `limit`.

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled (browser runtime). No login required.
- Rate awareness: a random sleep (200-700 ms) runs before the internal fetch; the command issues only 1 page navigation + 1 internal fetch, keeping each call well under the 10 s target.
- The endpoint is a page-internal fetch (not the REST API), so it is not subject to the anonymous API quota (60 req/hr, Search 10 req/min). Page-level access is rate-limited; keep cadence modest.

## Failure Signals

- `document.title` contains "Page not found" → repo does not exist → `NOT_FOUND`.
- `script[data-target="react-app.embeddedData"]` absent on a live page → page structure changed → `DRIFT_DETECTED`.
- `payload.graphDataPath` missing from embeddedData → structure changed → `DRIFT_DETECTED`.
- Data endpoint returns an empty array → repo has no contributor data → `EMPTY_RESULT`.
- `page.goto` or the internal fetch throws / non-OK HTTP → `NETWORK_ERROR`.
- 429/403/CAPTCHA: not observed during exploration; if it appears, slow down cadence. It would surface as a non-OK fetch response or a changed page body.

## Repair Clues

- The data endpoint URL is deterministic: `https://github.com/<owner>/<repo>/graphs/contributors-data`. If `graphDataPath` extraction ever breaks, the command can fall back to constructing this URL directly from the normalized `owner/repo`.
- GitHub's public REST API `GET /repos/{owner}/{repo}/contributors` returns the same `{ total, author, weeks }` shape as a fallback, but it is subject to the anonymous API quota and should be used only if the page endpoint degrades.
- The repo sidebar "Contributors" avatar strip is a lighter (count-less) fallback, but lacks contribution counts.
