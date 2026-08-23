# Evidence: huggingface/get-model

This document records the research and validation evidence for the `huggingface/get-model` command.

## Exploration Path

- Command library checked: existing `huggingface/get-trending` (list semantics) and `huggingface/get-papers` (papers list) do NOT cover model detail. `huggingface/get-model` is a new command that complements the sibling `huggingface/list-models` (list -> get chaining).
- Explore used Playwright CLI attach to the user's Chrome (session `<session>`), performing same-origin in-page `fetch()` on `https://huggingface.co/`. No DOM parsing was needed.
- Explore assess passed (`status: passed`) before capture. Contract was reviewed and confirmed by the user (recorded in explore trace.md `### Confirmation`).
- Command-line network (node https / curl) cannot reach huggingface.co (curl HTTP:000 timeout) — commands MUST use the browser's in-page fetch, reusing the user's Chrome network.

## Verified URLs

- https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1 -> 200, full model JSON
- https://huggingface.co/api/models/MiniMaxAI/MiniMax-H3 -> 200, generalizes to a second model (image-text-to-video, diffusers)
- https://huggingface.co/api/models/google-bert/bert-base-uncased -> 200, optional-field variance (safetensors/cardData shapes)
- https://huggingface.co/api/models/meta-llama/Llama-2-7b-hf -> 200 (gated: "manual", metadata still complete)
- https://huggingface.co/api/models/nonexistent-org-xyz/nonexistent-model-abc -> 404 {"error":"Repository not found"}
- https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/readme -> 404 (this endpoint does NOT exist)
- https://huggingface.co/deepseek-ai/DeepSeek-R1/raw/main/README.md -> 200, text/plain markdown (15972 bytes)
- https://huggingface.co/deepseek-ai/DeepSeek-R1/resolve/main/README.md -> 200 (redirects to resolve-cache, same content)
- https://huggingface.co/meta-llama/Llama-2-7b-hf/raw/main/README.md -> 403 (gated, not authorized)
- https://huggingface.co/deepseek-ai/DeepSeek-R1/raw/main/NO_SUCH_FILE_xyz.md -> 404 "Entry not found"

## Structural Evidence

- `GET /api/models/{org}/{name}` returns 200 with JSON. Verified top-level keys:
  `_id, id, private, pipeline_tag, library_name, tags, downloads, likes, modelId, author, sha, lastModified, gated, disabled, widgetData, model-index, config, cardData, transformersInfo, siblings, spaces, createdAt, safetensors, inference, usedStorage`.
- Key field shapes (verified from deepseek-ai/DeepSeek-R1):
  - id: "deepseek-ai/DeepSeek-R1", author: "deepseek-ai", sha: 40-hex string, downloads: int, likes: int
  - private: bool, gated: false | "manual" | "auto"
  - pipeline_tag: string ("text-generation"), library_name: string ("transformers")
  - tags: string[] including "license:mit", "arxiv:2501.12948"
  - cardData: object (license/library_name/language/...), may be null
  - safetensors: { parameters: { BF16?: number, F8_E4M3?: number, F32?: number }, total: number }, may be null
  - siblings: [{ rfilename: string }] — repo file list
  - spaces: string[] of repo ids using the model
  - createdAt / lastModified: ISO-8601 strings
- README: `/api/models/{id}/readme` returns 404 — that endpoint does NOT exist (plan assumption overturned by first-hand test). The working path is `GET /{org}/{name}/raw/main/README.md` -> 200 text/plain markdown (includes YAML front matter). `resolve/main/README.md` also works via redirect.
- Repo id normalization: accept `org/name` (e.g. `deepseek-ai/DeepSeek-R1`) or a full URL `https://huggingface.co/{org}/{name}`.
- Polite pacing: each HF request preceded by random wait + random scroll + random mouse move (explore verified `page.mouse.move` and `page.waitForTimeout`; daemon also supports `setTimeout` as used by sibling commands).

## Failure Signals

- Nonexistent model: `/api/models/{id}` -> 404 {"error":"Repository not found"} -> map to `NOT_FOUND`.
- Gated model (meta-llama/Llama-2-7b-hf, gated:"manual", not authorized): `/api/models/{id}` still 200 (metadata available); `/{id}/raw/main/README.md` -> 403 "Access to model ... is restricted ... you are not in the authorized list".
- Missing README file: `/{id}/raw/main/NO_SUCH_FILE.md` -> 404 "Entry not found".
- include_readme contract: if README is unavailable (403 gated/private, 404 missing file), return `readme: null` + `readmeError: { status, reason }`; main metadata still returns normally (no hard error).
- Non-200 on model API (other than 404) -> `NETWORK_ERROR`.
- No 429/CAPTCHA observed during explore (~9 requests). Polite pacing kept light to stay under the ≤10s per-command budget.

## Capture Assessment

This command should be captured. It fills the model-detail gap (downloads/license/size/task/README/spaces) that list-models cannot provide, uses a stable and verified API path (`/api/models/{id}` + `/{id}/raw/main/README.md`), was validated end-to-end on three models, and is highly reusable for AI callers working with Hugging Face models.
