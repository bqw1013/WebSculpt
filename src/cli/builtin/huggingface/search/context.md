# Context

## Precipitation Background (Why This Command Exists)

Part of the HF command family batch (with `list-models`/`list-datasets`/`list-spaces`). The plan `docs/huggingface-commands-plan.md` §13 required a cross-type keyword search over models/datasets/spaces. Explore verified that three list APIs can be merged stably; the `/search/full-text` page was tested and rejected (fragile Tailwind DOM, `?p=N` pagination, no stable JSON API).

## Value Assessment

High reuse: keyword search is the primary entry point for finding HF repos; the merged output feeds directly into `get-model`/`get-dataset`/`get-space` for detail lookups. Reuses the same list-API paths as the `list-*` commands, so capture and maintenance cost is shared.

## Page Structure

- No DOM extraction; all data via in-page fetch of `/api/models`, `/api/datasets`, `/api/spaces` with `?search=<q>&limit=<n>`.
- Page navigation: `https://huggingface.co/models` (any HF-origin page enables same-origin fetch).
- API item shapes: models have `downloads/likes/pipeline_tag/library_name/tags`; datasets have `downloads/likes/tags`; spaces have `likes/sdk/tags` (no downloads).

## Environment Dependencies

- Browser runtime; requires Chrome/Edge running with remote debugging enabled. No login.
- Command-line networking cannot reach huggingface.co; browser-only.
- Polite pacing: random mouse move + random scroll + jittered delays around the fetch batch; rate-limit quota is 1000 req / 300s, this command uses 1-3 requests per invocation.

## Failure Signals

- Any list API non-200 → `NETWORK_ERROR` (surface the HTTP status).
- All queried types empty → `EMPTY_RESULT`.
- Missing query → `MISSING_PARAM`; bad `type`/`limit` → `INVALID_PARAM`.
- If 429/403/CAPTCHA appear, increase the jittered delays between the concurrent fetches.

## Repair Clues

- If an endpoint returns an unexpected shape, re-verify via `https://huggingface.co/api/models?search=x&limit=1` in the browser.
- If HF moves the list-API paths, fall back to the list pages (`/models`, `/datasets`, `/spaces` search boxes) via DOM, matching the `list-*` commands.
- `/search/full-text` remains an alternative if content-level (README) search is later required; revisit its `?p=N` pagination.
- Model URLs are canonical `https://huggingface.co/{org}/{name}` — never emit `https://huggingface.co/models/{org}/{name}` (HTTP 404). Datasets/spaces keep their `/datasets/`/`/spaces/` prefixes.
- `limit` must be a pure integer string (`/^\d+$/`) before `parseInt`; reject `1.5`/`1e3`/`2abc`/`+5`/`" 7"`/empty. Empty `type` (`""`) is rejected as `INVALID_PARAM`, aligned with `"model "`.
