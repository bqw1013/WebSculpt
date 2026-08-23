# Evidence: huggingface/get-dataset

This document records the research and validation evidence for the `huggingface/get-dataset` command.

## Exploration Path

Command library check: `websculpt command list huggingface` -> existing commands are `huggingface/get-papers` (browser, papers list) and `huggingface/get-trending` (browser, list cards). No command covers dataset detail metadata. This command is new, per docs/huggingface-commands-plan.md section 3 (`huggingface/get-dataset`).

Explored with `@playwright/cli` attached to the user's Chrome (session `<session>`). Reused verified paths from a prior explore workspace (browser in-page fetch of HF internal API; CLI node/curl cannot connect to huggingface.co). A prior explore workspace passed `websculpt explore assess` (status: passed, capture eligible: yes).

## Verified URLs

- `https://huggingface.co/datasets/HuggingFaceFW/fineweb` — dataset detail page, JS-rendered (h1 `Datasets: HuggingFaceFW / fineweb`, Downloads last month, chips arxiv/doi/license). Not read via DOM; the internal API is the data source.
- `https://huggingface.co/api/datasets/HuggingFaceFW/fineweb` — browser in-page fetch, HTTP 200, complete JSON (all fields below).
- `https://huggingface.co/api/datasets/openai/gsm8k` — browser in-page fetch, HTTP 200, tags structure consistency across datasets.
- `https://huggingface.co/api/datasets/this-dataset-does-not-exist-xyz-12345` — non-existent dataset, HTTP 404, JSON body `{"error":"Repository not found"}`. NOT_FOUND detection basis.

## Structural Evidence

The dataset detail page is JS-rendered and not read directly. The data source is HF's internal REST API reached via browser in-page fetch (same origin, reuses the user's Chrome network). `GET /api/datasets/{id}` where `id` is `org/name` returns a full JSON object (verified 2026-08-09):

```
/api/datasets/{id}  (HTTP 200)
├─ id            "HuggingFaceFW/fineweb"
├─ author        "HuggingFaceFW"
├─ sha           latest commit sha
├─ downloads     number (378620)
├─ likes         number (3133)
├─ private       boolean (false)
├─ gated         boolean (false)
├─ tags[]        array of "key:value" strings
│   core categories always present: task_categories:, language:, license:, size_categories:
│   extras vary per dataset: modality:, arxiv:, doi:, region:, library:*, format:*, benchmark:*, ...
├─ description   dataset card description text (markdown/HTML)
├─ cardData      object; structure varies per dataset (fineweb: license/task_categories/language/pretty_name/size_categories/configs; gsm8k adds annotations_creators/language_creators/multilinguality/source_datasets/task_ids/paperswithcode_id/tags/dataset_info/...)
├─ siblings[]    array of { rfilename } (file list; fineweb 28,147 files)
├─ createdAt     ISO string (e.g. 2024-04-18T14:33:13.000Z)
├─ lastModified  ISO string
└─ usedStorage   bytes (117390103814494 for fineweb)
```

repo parameter normalization (verified): input may be `org/name` or a full URL. Strip the `https://huggingface.co/datasets/` prefix (and any protocol/www/version prefix) to obtain `org/name`. Verified: `https://huggingface.co/datasets/HuggingFaceFW/fineweb` -> `HuggingFaceFW/fineweb` -> fetch `/api/datasets/HuggingFaceFW/fineweb` HTTP 200 with matching `id`.

NOT_FOUND: `/api/datasets/{id}` returns HTTP 404 with JSON body `{"error":"Repository not found"}`. Detect `res.status === 404` and throw NOT_FOUND.

## Failure Signals

- 404: HTTP 404 with JSON `{"error":"Repository not found"}` -> NOT_FOUND. Check status before attempting normal output.
- NETWORK_ERROR: `page.goto` to huggingface.co fails, or the in-page fetch rejects (JSON parse failure, non-200 status).
- 429/403 rate limiting possible under rapid repeated calls from the shared browser; mitigate with random waits and serial (non-concurrent) calls. No 429/403/CAPTCHA observed during exploration (fetches all returned 200).
- INVALID_PARAM: empty `repo`, or a value that cannot be normalized to a valid `org/name` (e.g. missing slash, or not a huggingface.co URL).
- DRIFT: if `/api/datasets/{id}` response shape changes (e.g. non-JSON, missing `id`), the command should throw a clear error rather than return partial output.

## Capture Assessment

Captured as `huggingface/get-dataset`. The path is verified and reproducible: navigate once to huggingface.co to establish the origin, then fetch `/api/datasets/{id}` in-page and pass through all fields. Browser runtime is required because CLI node/curl cannot reach huggingface.co (connection blocked); only the user's Chrome network can access it. No external API quota is consumed, so rate limits are governed by HF server-side access control; random waits keep the request rate low.
