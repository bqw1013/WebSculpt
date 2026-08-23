# Context

## Precipitation Background (Why This Command Exists)

HF list commands return repo ids but had no detail command for datasets. Users need a dataset's full metadata (downloads, license, language, size category, description) after finding it in a list. This command fills that gap, following docs/huggingface-commands-plan.md section 3.

## Value Assessment

High reuse: dataset metadata is a core HF data path. Reuses the user's Chrome network (CLI node/curl cannot reach huggingface.co — connection is blocked), so it works reliably from the browser. Single internal-API call after one lightweight navigation; fast and quota-free.

## Page Structure

- Navigate once to `https://huggingface.co/datasets/{org}/{name}` (`domcontentloaded`) purely to establish the huggingface.co origin. The JS-rendered page is NOT read.
- In-page fetch `https://huggingface.co/api/datasets/{id}` (same origin) returns the full JSON: id/author/sha/downloads/likes/private/gated/tags/description/cardData/siblings/createdAt/lastModified/usedStorage.
- `repo` normalization: strip `https://huggingface.co/datasets/` prefix (also handles `http://`, `www.`, trailing slash) to obtain `org/name`, then build the API URL.

## Environment Dependencies

- Browser runtime. Requires Chrome or Edge running with remote debugging enabled. No login required (`authRequired: not-required`).
- Polite pacing: random mouse move + random scroll + random wait before the fetch; serial calls only; single-call target ≤10s.
- The command relies on the browser being attached; if not, the runner reports `BROWSER_ATTACH_REQUIRED` (infrastructure-level, not thrown by this command).

## Failure Signals

- HTTP 404 with JSON `{"error":"Repository not found"}` → `NOT_FOUND`.
- `page.goto` failure or in-page fetch rejection → `NETWORK_ERROR`.
- 429/403 possible under rapid repeated calls from the shared browser; mitigated with random waits and serial (non-concurrent) calls. No 429/403/CAPTCHA observed during exploration.
- If `/api/datasets/{id}` response lacks an `id` field → `DRIFT_DETECTED`.

## Repair Clues

- If the single detail endpoint misbehaves, `GET /api/datasets?search={keyword}&limit=1` can be used as a fallback to locate a dataset.
- `tags` and `cardData` shapes vary per dataset; pass them through as-is instead of assuming fixed keys (fineweb vs gsm8k differ).
