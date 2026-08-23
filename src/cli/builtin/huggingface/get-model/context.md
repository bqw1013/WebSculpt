# Context

## Precipitation Background (Why This Command Exists)

`huggingface/get-model` was precipitated to fill the model-detail gap in the HF command family. `huggingface/list-models` returns ranked model ids, but there was no way to fetch a single model's full metadata (downloads, license, model size, task, README, linked Spaces). It complements list-models via list -> get chaining.

## Value Assessment

High reuse: any AI caller working with HF models needs details after listing. The path (`/api/models/{id}` + `/{id}/raw/main/README.md`) is stable and was verified end-to-end on three models during explore. Saves a full browser exploration per model.

## Page Structure

- Origin page: `https://huggingface.co/models` (navigated once to establish same-origin for in-page fetch; DOM is not parsed).
- Metadata API: `GET /api/models/{org}/{name}` -> full JSON (id/author/sha/downloads/likes/private/gated/pipeline_tag/library_name/tags/cardData/safetensors/siblings/spaces/createdAt/lastModified, plus config/transformersInfo/usedStorage/inference etc.).
- README: `GET /{org}/{name}/raw/main/README.md` -> text/plain markdown (includes YAML front matter). Do NOT use `/api/models/{id}/readme` — that endpoint returns 404. `resolve/main/README.md` also works (redirect to resolve-cache).

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled (`chrome://inspect/#remote-debugging`). No login required for public models.
- Command-line network cannot reach huggingface.co; the command MUST use the browser's in-page fetch.
- Polite pacing: random mouse move + random scroll + random wait before each HF request, kept light to stay under the ~10s per-command budget.
- The daemon context supports `setTimeout` (used by sibling HF commands); explore's run-code sandbox did not, so tests should rely on the installed command behavior, not run-code.

## Failure Signals

- Model API 404 -> `NOT_FOUND` ("Repository not found").
- README fetch 403 -> gated/private model, not authorized -> `readme: null` + `readmeError`.
- README fetch 404 -> no `README.md` in repo root -> `readme: null` + `readmeError`.
- Model API other non-200 -> `NETWORK_ERROR`.
- If the model API shape changes (e.g. `siblings` no longer an array), callers may see missing fields; check the top-level keys and field types.

## Repair Clues

- If `/api/models/{id}` breaks, fall back to reading the model detail page DOM (h1, `dl` "Downloads last month", Safetensors section) — explored during explore but not needed for the current implementation.
- If the README raw path changes, try `/api/models/{id}/raw/main/README.md` or the `/resolve/main/README.md` redirect.
- If 429/403 occurs, increase the random wait range in the polite pacing block and retry.
