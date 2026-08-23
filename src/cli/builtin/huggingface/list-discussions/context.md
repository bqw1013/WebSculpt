# Context

## Precipitation Background (Why This Command Exists)

Command-line networking (node https / curl) cannot reach huggingface.co (curl HTTP 000 timeout). The verified path is the user's browser: navigate once to establish the huggingface.co origin, then `fetch('/api/...')` in-page returns structured JSON. The discussion list page itself is SSR (no client API call, no `__NUXT_DATA__`), but the internal discussions API is the stable structured path. No existing HF command covered the repo discussion list; this command is the list counterpart to `huggingface/get-discussion` (single thread).

## Value Assessment

The community discussion layer is a high-value, high-frequency HF data path (issue-like threads per repo). This command exposes number/title/url/author/opened_at/comments_count/status for any model/dataset/Space repo, auto-detects repo type, and chains directly into `get-discussion` (output `url`/`number`). Replaces manual browsing of the discussions tab.

## Page Structure

- Data source: `https://huggingface.co/api/{models|datasets|spaces}/{repo}/discussions?status=open&p={0-based page}` (in-page same-origin fetch).
- Origin page: `https://huggingface.co/` (navigate once; `waitUntil: 'domcontentloaded'`).
- Response shape: `{ discussions: [], count, start, numClosedDiscussions }`.
- Discussion item keys: `num, author{name,fullname,avatarUrl,...}, repo{name,type}, title, status(open|draft|closed), createdAt(ISO), isPullRequest, numComments, topReactions, numReactionUsers, pinned, repoOwner`.
- Repo type endpoints: models `/api/models/{repo}/discussions`, datasets `/api/datasets/{repo}/discussions`, spaces `/api/spaces/{repo}/discussions`. No generic endpoint (`/api/discussions/{repo}` and `/api/discussions?repoId=` are 404).
- Pagination: API returns a fixed 50/page and ignores `limit`/`start`; paginate with `p` (0-based). `status=open` includes `draft` PRs (visible, treated as open); `count` is the open+draft total.
- URL construction for items: model -> no prefix; dataset -> `datasets/`; space -> `spaces/` (from item `repo.type`, singular -> plural+s).

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled (daemon `connectOverCDP`). No login required.
- The daemon's CDP attach is independent of the explore-stage `@playwright/cli` attach; the first daemon attach may trigger a Chrome "allow remote debugging" confirmation dialog.
- Polite pacing: command does a short random mouse movement, scroll, and random wait before the fetch. Do not remove entirely; HF may rate-limit under rapid repeated calls (429/403/CAPTCHA). Keep it light so a single call stays <=10s.

## Failure Signals

- `params.repo` empty -> `MISSING_PARAM`; not `org/name` or full URL -> `INVALID_PARAM` (thrown before any network call).
- `params.limit` must be a pure integer string (`/^\d+$/`) in 1-100 before `parseInt` — reject `1.5`/`1e3`/`2abc`/`+5`/`" 7"`/empty.
- Repo exists but has zero open discussions -> `EMPTY_RESULT` (not an empty list), aligned with `list-models`/`search`.
- All three type probes return non-200/`error` body -> `NOT_FOUND`.
- `page.goto`/in-page fetch failure -> `NETWORK_ERROR` (wrapped; no raw Playwright error).
- API non-200 or unparseable body -> `NETWORK_ERROR` (message includes server error text and status).
- No browser attached -> daemon returns `BROWSER_ATTACH_REQUIRED`.
- HF rate limiting -> non-200 (429/403) or CAPTCHA page; surface as `NETWORK_ERROR` with the server message.

## Repair Clues

- If the API shape changes, re-check the item keys listed above and update the map in `command.js`.
- If the discussions API path changes, the probe list `TYPE_ENDPOINTS` (models/datasets/spaces) is the single place to update.
- If HF starts returning a login wall or CAPTCHA HTML instead of JSON, the fetch body will fail JSON parse -> `NETWORK_ERROR`; consider adding a longer random backoff between retries.
