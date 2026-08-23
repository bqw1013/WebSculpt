# Context

## Precipitation Background (Why This Command Exists)

GitHub search (`https://github.com/search`) is the platform's primary discovery entry. Prior github commands (`get-repo`, `get-user`, `get-issue`, `get-pull`, `list-*`) all target a known repo/user; there was no keyword-based entry. This command fills that gap, returning the top repositories/users/issues/PRs for a keyword with type-specific fields, ready to chain into the get-/list- commands.

## Value Assessment

High reuse: keyword search is a frequent need ("what are the most-starred Rust repos", "find a user named X", "track issues mentioning Y"). Outputs chain directly into other github commands via `html_url`. Browser runtime avoids the REST Search API's anonymous 10 req/min throttle; the page is not throttled when requests are spaced out.

## Page Structure

- Search page is React-rendered. `script[data-target="react-app.embeddedData"]` holds JSON with `payload` = `{ type, result_count, results[], page, page_count, errors, warn_limited_results, ... }`.
- `payload.results` = exactly 10 items/page; each full `page.goto` re-renders fresh embeddedData for the current URL.
- Fallback DOM container: `[data-testid="results-list"]` > `div.Result-module__Result__I0WVD`.
- Type URL values: repositories / users / issues / `pullrequests` (pull requests). Sort params (repositories only): stars → `&s=stars&o=desc`, updated → `&s=updated&o=desc`. Pagination: `&p=N` (max 100 pages).
- Field mapping (raw → output): repositories `repo.repository.{owner_login,name,updated_at}`, `followers` = stars, `hl_trunc_description` → description, `topics`, `archived`; users `login`, `profile_bio` → bio, `location`, `followers`, `repos`; issues/PRs `number`, `hl_title` → title, `author_name`, `state`, `num_comments`, `created`, `labels`, `merged` (PRs). Strip `<em>` from all `hl_*` fields.

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled; daemon connects over CDP (separate from explore's playwright-cli attach). No login required (public search).
- Polite pacing: random 200-700ms sleep between browser operations; random scroll/mouse; single-page target ≤10s; pagination is slightly slower. Throttle requests; do not hammer the site.
- First daemon connect may pop Chrome's system allow-remote-debugging dialog; if the command returns BROWSER_ATTACH_REQUIRED, confirm remote debugging is enabled and retry (the dialog may have blocked the connect).

## Failure Signals

- Empty result: `payload.result_count === 0`, `results === []`, no `[data-testid="results-list"]`, page body contains "Your search did not match any" → EMPTY_RESULT.
- Silent type fallback: `type=pull-requests` (hyphen) renders repositories results — the command maps it to `pullrequests`; if output `type` no longer matches the request, the mapping broke.
- `script[data-target="react-app.embeddedData"]` missing or payload shape changed → fall back to `[data-testid="results-list"]`; if that is also empty/unreadable → DRIFT_DETECTED.
- 429/403/CAPTCHA: slow down and retry; report observed throttle cadence in tests.

## Repair Clues

- If embeddedData field names change, update the per-type mappers in `command.js` (single place, near the top of the file).
- If the DOM fallback class names (`Result-module__...`, `search-title`, `stargazers`) drift, the fallback degrades gracefully to partial fields (nulls) — prefer fixing the embeddedData path.
- Pagination repeat guard: compares `html_url` of the first item of each page; if GitHub starts returning repeated pages, tighten the guard to compare all new items.
- sort only effective for repositories; for other types GitHub ignores it. If GitHub later adds sort support for other tabs, extend `SORT_PARAM` usage beyond repositories.
