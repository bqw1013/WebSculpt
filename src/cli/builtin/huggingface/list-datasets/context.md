# Context

## Precipitation Background (Why This Command Exists)

Hugging Face dataset index is a high-frequency lookup surface. The pre-existing `huggingface/get-trending` only exposed sort/type against DOM cards; it had no search, no author filter, and no structured tags. This command was precipitated from an explore of the HF internal API (`/api/datasets`) to give a filterable dataset list (search/sort/author/limit) with structured output, part of a batch that also adds list-models / list-spaces / search.

## Value Assessment

Reusable on demand: finding a dataset by keyword, ranking by likes/downloads/latest, or listing one author's datasets are all common tasks. Saves re-running browser exploration and parsing DOM each time; returns the same structured JSON the HF site itself uses. No login needed.

## Page Structure

- Anchor page: `https://huggingface.co/datasets` (SSR; command only uses it for same-origin, then fetches the API — it does not read the DOM).
- API endpoint: `GET /api/datasets` with query params `search`, `sort`, `author`, `limit` (same-origin page-internal fetch).
- API response: array of objects with fields `id, author, downloads, likes, trendingScore, tags, createdAt, lastModified, ...` (no `url` — built as `https://huggingface.co/datasets/{id}`).
- Sort mapping (CLI → API): trending→(omitted, API default), likes→likes, downloads→downloads, created→createdAt, modified→lastModified.
- tags: `task_categories:*`, `language:*`, `license:*`, `size_categories:*`, plus modality/arxiv/doi/region/format/library; arrays can be large (e.g. fineweb-2 has hundreds of language tags).

## Environment Dependencies

- Browser runtime: daemon `connectOverCDP` attaches the user's running Chrome/Edge (requires remote debugging enabled). Explore-phase `@playwright/cli` attach and capture-phase daemon attach are two independent CDP connections.
- No login required; public data only.
- Command-line network (node/curl) cannot reach huggingface.co — never fall back to it.
- Polite pacing (user hard requirement): random wait + mouse move + scroll before the fetch; must not noticeably slow the command (target ≤10s per call; measured ~2-4s).

## Failure Signals

- `{"error":"✖ Invalid sort parameter: X"}` — API rejects an unknown sort token; prevented by pre-validating the enum.
- `INVALID_PARAM` for limit — the command validates the raw string with `/^\d+$/` before range-checking 1-100; non-integer strings (`1.5`, `1e3`, `2abc`, `+5`, `" 7"`) are rejected instead of silently parseInt-truncated. `sort` is trimmed before validation (consistent with search/author).
- Non-200 or non-array response — API/network issue; command throws NETWORK_ERROR with the API message.
- Empty array — success with no matches; command throws EMPTY_RESULT.
- 429/403/CAPTCHA — rate limiting triggered; not observed during explore (all 200). If seen, the throttle in command.js may need to be strengthened.

## Repair Clues

- If `/api/datasets` path changes, inspect the network tab of `https://huggingface.co/datasets` for the new list endpoint.
- If sort tokens change, re-verify valid values by probing `/api/datasets?sort=<candidate>` and update `SORT_TOKENS`.
- Alternative entry: read the SSR card DOM on `/datasets` (`article.overview-card-wrapper`) as a fallback if the API breaks.
- Re-validate the sort mapping in tests (field consistency): created→createdAt returns newest-created first, modified→lastModified returns recently-updated first.
