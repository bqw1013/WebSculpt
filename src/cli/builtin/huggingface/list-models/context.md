# Context

## Precipitation Background (Why This Command Exists)

Command-line networking (node https / curl) cannot reach huggingface.co (curl HTTP 000 timeout). The verified path is the user's browser: navigate once to `https://huggingface.co/models` to establish the origin, then `fetch('/api/models?...')` in-page returns structured JSON. No existing HF command could filter models by task (pipeline_tag), search, or author; `get-trending` only exposed type/sort and its scenario is now covered by this command's default `sort=trending`.

## Value Assessment

HF model listing is the highest-frequency HF data path. This command adds pipeline_tag (47-value task filter), search, author, and sort dimensions, returns structured fields (likes/downloads/trendingScore/tags/times), and chains into `get-model`. Replaces manual browsing and the old `get-trending` command.

## Page Structure

- Data source: `https://huggingface.co/api/models?limit=&sort=&pipeline_tag=&search=&author=` (in-page same-origin fetch, JSON array).
- Origin page: `https://huggingface.co/models` (navigate once; `waitUntil: 'domcontentloaded'`).
- List item keys: `_id, id, likes, private, downloads, tags[], pipeline_tag, library_name, createdAt, modelId`, plus conditionally `trendingScore` (only sort=trendingScore) and `lastModified` (only sort=lastModified).
- Sort mapping (CLI → API): trending→trendingScore, likes→likes, downloads→downloads, created→createdAt, modified→lastModified. The API rejects `trending`/`created`/`modified` literally (HTTP 400 `Invalid sort parameter`).
- pipeline_tag authority: `https://huggingface.co/tasks` — exactly 47 unique slugs.

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled (daemon `connectOverCDP`). No login required.
- The daemon's CDP attach is independent of the explore-stage `@playwright/cli` attach; the first daemon attach may trigger a Chrome "allow remote debugging" confirmation dialog.
- Polite pacing: command does a short random mouse movement, scroll, and random wait before the fetch. Do not remove entirely; HF may rate-limit under rapid repeated calls (429/403/CAPTCHA). Keep it light so a single call stays ≤10s.

## Failure Signals

- `params.sort`/`params.pipeline_tag`/`params.limit` invalid → command throws `INVALID_PARAM` before any network call. `limit` must be a pure integer string (`/^\d+$/`) before `parseInt` — reject `1.5`/`1e3`/`2abc`/`+5`/`" 7"`/empty. Empty `pipeline_tag` (`""`) is rejected like `sort ""`.
- `--search` is trimmed; whitespace-only input is treated as no filter (`filters.search` null).
- Zero matches for any filter combination → `EMPTY_RESULT` (not an empty list), aligned with `search`/`list-spaces`.
- `page.goto`/in-page fetch failure → `NETWORK_ERROR` (wrapped; no raw Playwright error).
- API non-200 or unparseable body → `NETWORK_ERROR` (message includes server error text and status).
- No browser attached → daemon returns `BROWSER_ATTACH_REQUIRED`.
- HF rate limiting → non-200 (429/403) or CAPTCHA page; surface as `NETWORK_ERROR` with the server message.

## Repair Clues

- If the API shape changes, re-check the item keys listed above and update the map in `command.js`.
- If the models page URL changes, only the origin page for the in-page fetch matters; the fetch URL is fixed at `/api/models`.
- If HF starts returning a login wall or CAPTCHA HTML instead of JSON, the fetch body will fail JSON parse → `NETWORK_ERROR`; consider adding a longer random backoff between retries.
