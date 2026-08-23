# Evidence: github/search

This document records the research and validation evidence for the `github/search` command.

## Exploration Path

- Library check: `websculpt command domains` shows github domain; `websculpt command list` shows `github/get-issue`, `github/get-pull`, `github/get-repo`, `github/get-trending` (delivered) plus in-flight `list-*` / `get-user` commands from parallel agents. No keyword-based search command exists; `github/search` is new and does not conflict.
- Explored and audited (audit passed, user confirmed contract).
- Exploration method: one anonymous curl check (HTTP 429, GitHub search throttles anonymous curl) then Playwright CLI attached to the user's Chrome to verify the React page, embeddedData payload, type/sort URL mapping, pagination, and empty-result signal. No 429/403/CAPTCHA during exploration (~20 navigations/evals with random 200-700ms sleeps).

## Verified URLs

- https://github.com/search?q=rust&type=repositories
- https://github.com/search?q=rust&type=users
- https://github.com/search?q=rust&type=issues
- https://github.com/search?q=rust&type=pullrequests
- https://github.com/search?q=rust&type=pull-requests (⚠ silently falls back to repositories)
- https://github.com/search?q=rust&type=repositories&s=stars&o=desc
- https://github.com/search?q=rust&type=repositories&s=updated&o=desc
- https://github.com/search?q=rust&type=users&s=stars&o=desc (sort ignored for users)
- https://github.com/search?q=rust&type=repositories&p=2 (pagination)
- https://github.com/search?q=zzqqnonexistentxyz123&type=repositories (empty result)

## Structural Evidence

### Page mechanism

- `https://github.com/search?q={query}&type={type}` is a React page. It contains `<react-app>` and a script tag `script[data-target="react-app.embeddedData"]` whose JSON has `payload` with keys: `type / result_count / results / page / page_count / errors / warn_limited_results / facets / csrf_tokens`.
- `payload.results` holds exactly 10 items per page; `payload.result_count` is the total match count; `payload.page_count` caps at 100 (GitHub search returns at most ~1000 results).
- Each full `page.goto` (URL change) produces a fresh SSR `embeddedData` matching the current URL (verified for each type/sort/page combination).
- DOM fallback container: `[data-testid="results-list"]` > `div.Result-module__Result__I0WVD` (10 children). When empty, `[data-testid="results-list"]` is absent.
- Pagination: `nav[aria-label="Pagination"]` with `?p=N` links (Next → `?p=2`). Verified `?p=2` returns a different first result (`sunface/rust-course`) than `?p=1` (`rust-lang/rust`).

### type mapping (user-side value → URL value → payload.type)

| user value | URL value | payload.type | verified |
|---|---|---|---|
| repositories | `type=repositories` | repositories | OK |
| users | `type=users` | users | OK |
| issues | `type=issues` | issues | OK |
| pull-requests | `type=pullrequests` | pullrequests | OK |
| pull-requests | `type=pull-requests` (hyphen) | **repositories** | ⚠ silently falls back to repositories — MUST map `pull-requests` → `pullrequests` |

Result-tab links on the page use exactly: Repositories→`type=repositories`, Issues→`type=issues`, Pull requests→`type=pullrequests`, Users→`type=users`.

### sort mapping (repositories)

- `best-match`: no `s`/`o` params (default).
- `stars`: `&s=stars&o=desc` → stars descending (verified top-5: 195k/129k/125k/119k/115k).
- `updated`: `&s=updated&o=desc` → updated_at descending (verified first 2026-08-09T08:41:00).
- Non-repositories: `&s=stars&o=desc` is ignored (users page still best-match; verified first user `rust` with only 205 followers). sort is only effective for repositories.

### extraction (primary: embeddedData payload)

```
payload = JSON.parse(document.querySelector('script[data-target="react-app.embeddedData"]').textContent).payload
results = payload.results   // 10/page
```

Raw fields → mapped output (strip `<em>` highlight tags from hl_* fields):
- repositories: `repo.repository.owner_login + '/' + repo.repository.name` → full_name; `followers` == stars; `hl_trunc_description` → description; `language`; `repo.repository.updated_at`; `topics[]`; `archived`.
- users: `login` (+`name`); `profile_bio` → bio; `location`; `followers`; `repos`.
- issues: `number`, `hl_title` → title, `repo.repository.owner_login/name` → repo, `author_name`, `state`, `num_comments`, `created`, `labels[]`; html_url = `https://github.com/{owner}/{repo}/issues/{number}`.
- pull-requests: same as issues; html_url = `https://github.com/{owner}/{repo}/pull/{number}`; extra `merged`, `reviewable_state`; PR distinguished by non-null `issue.issue.pull_request_id`.

### verified samples (q=rust, best-match)

- repositories (result_count 612516): `rust-lang/rust` 115374 stars, `TheAlgorithms/Rust` 25975, `rustdesk/rustdesk` 119935 — fields above populated, topics + archived present.
- users (result_count 51843): `{ login: "rust", name: "Shinichiro OGAWA", bio: "Software Engineer at ITANDI / CEO at Leisurely Works, LLC. / Ruby/Rails engineer", location: "Tokyo, Setagaya", followers: 205, repos: 66 }`.
- issues (result_count 1115788): `{ number: 12, title: "fix(rust): Rust example", repo: "hdds-team/hdds", author: "carlocorradini", state: "open", comments: 1, created_at: "2026-07-24T15:49:08.000+02:00", labels: [] }`.
- pull-requests (result_count 4204743): `{ number: 21, title: "Rust", repo: "bloveless/mu", author: "bloveless", state: "open", comments: 48, created_at: "2026-08-01T03:08:12.000Z", merged: false, labels: [] }`.

## Failure Signals

- Empty result: `payload.result_count === 0` and `results === []`; DOM `[data-testid="results-list"]` absent; page body contains "Your search did not match any repositories". → EMPTY_RESULT.
- 404/NOT_FOUND: search queries never return 404; NOT_FOUND is not triggered by this command (kept as family-level error code).
- Type fallback trap: passing `type=pull-requests` (hyphen) silently renders repositories results — command must map user value `pull-requests` to URL value `pullrequests` before navigation.
- Rate awareness: anonymous curl to the search page is throttled (HTTP 429). Browser session with throttled requests was not throttled during exploration; if 429/403/CAPTCHA is observed, slow down and retry.
- Browser attach: `BROWSER_ATTACH_REQUIRED` if Chrome/Edge remote debugging is not enabled; first daemon connect may pop a system allow-dialog (retry after user confirmation).
- Drift: if `script[data-target="react-app.embeddedData"]` disappears or `payload.results` shape changes, fall back to DOM `[data-testid="results-list"]`; if both fail, throw DRIFT_DETECTED.

## Capture Assessment

This command should be captured. GitHub search is the platform's core discovery entry (keyword → repositories/users/issues/PRs); the path is verified end-to-end in explore with stable structured extraction via `embeddedData`, clean per-type output with chainable html_url fields, and clear error codes. It complements the existing github `get-*`/`list-*` commands (which target known repos/users) by adding the keyword entry point.
