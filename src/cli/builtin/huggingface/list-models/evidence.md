# Evidence: huggingface/list-models

This document records the research and validation evidence for the `huggingface/list-models` command.

## Exploration Path

Command library overlap check: `websculpt command list huggingface` shows existing commands `huggingface/get-papers` and `huggingface/get-trending`. No existing `list-models`. The new `huggingface/list-models` deprecates and folds in `get-trending` (trending is just the default sort of the models list; this command adds pipeline_tag/search/author/limit dimensions).

The exploration used Playwright CLI attach to the user's Chrome (session `<session>`), and all data was collected via in-page same-origin `fetch('/api/models?...')` returning structured JSON (no DOM reading). Command-line networking (node/curl) cannot reach huggingface.co (curl HTTP 000 timeout), so the command must run through the browser.

## Verified URLs

- `https://huggingface.co/models` — models list page; tab ownership confirmed (URL `https://huggingface.co/models`, title "Models – Hugging Face"). The page's internal API is the data source, not the DOM.
- `https://huggingface.co/tasks` — authority source for the 47 pipeline task slugs; `a[href^="/tasks/"]` yielded exactly 47 unique slugs, matching the plan.
- `https://huggingface.co/api/models?search=&pipeline_tag=&sort=&author=&limit=` — the list API fetched in-page; all valid combinations returned HTTP 200.

Reused verified paths from a prior explore workspace: model detail `/api/models/{id}` returns full JSON; `/models` page URL params `?pipeline_tag=&sort=` are effective.

## Structural Evidence

List API response shape (single item, `GET /api/models?sort=likes&limit=1`):

```json
{
  "_id": "66aaa908fc35e079a941470d",
  "id": "black-forest-labs/FLUX.1-dev",
  "likes": 14050,
  "private": false,
  "downloads": 487171,
  "tags": ["diffusers","safetensors","text-to-image","license:other","region:us"],
  "pipeline_tag": "text-to-image",
  "library_name": "diffusers",
  "createdAt": "2024-07-31T21:13:44.000Z",
  "modelId": "black-forest-labs/FLUX.1-dev"
}
```

Field behavior (verified):
- `trendingScore` is returned ONLY when `sort=trendingScore` (the default sort key).
- `lastModified` is returned ONLY when `sort=lastModified`.
- `author` is never present in list items; derive it from the `org/` prefix of `id`.
- Minimal/new models (e.g. `zatup/sn99-agent-v2` with only `tags:["region:us"]`) may lack `pipeline_tag`/`library_name`.

Accepted `sort` keys (verified): `trendingScore` (default; omitting sort returns the same order), `likes`, `downloads`, `createdAt`, `lastModified`. Rejected with HTTP 400 `✖ Invalid sort parameter`: `trending`, `created`, `modified`, `updatedAt`, `name`, `params`, `downloads_last_month`, `score`.

CLI-facing sort mapping required: `trending`→`trendingScore`, `likes`→`likes`, `downloads`→`downloads`, `created`→`createdAt`, `modified`→`lastModified`.

Filters verified:
- `search=deepseek` → deepseek-related models (deepseek-ai/DeepSeek-V4-Flash-0731, unsloth/...-GGUF, huihui-ai/...-GGUF).
- `pipeline_tag=text-generation&sort=likes` → deepseek-ai/DeepSeek-R1, meta-llama/Meta-Llama-3-8B, meta-llama/Llama-3.1-8B-Instruct.
- `search=deepseek&pipeline_tag=text-generation&sort=likes` combined → all deepseek text-generation models (DeepSeek-R1/V4-Pro/V3).
- `author=deepseek-ai` → HTTP 200 with full list-item metadata (keys: _id/id/likes/trendingScore/private/downloads/tags/pipeline_tag/library_name/createdAt/modelId) — same shape as the normal list. This also validates the `get-user` dependency.
- `author=<hf-user>` → 200, returns that user's models.
- `search` with spaces must be URL-encoded (`vision%20transformer`).

`limit` behavior: `limit=100`→100 items; `limit=101`→101 (API does not clamp); `limit=0` or omitted→up to 1000 (default cap); `limit=1`→1. An invalid pipeline_tag (`not-a-real-task`) → HTTP 200 with an empty array (not an error). The command validates `limit` (raw string must match `/^\d+$/` before `parseInt` — rejects `1.5`/`1e3`/`2abc`/`+5`/`" 7"`/empty — then range 1-100) and pipeline_tag against the 47-slug enum before calling the API. Empty `pipeline_tag` (`""`) is rejected as `INVALID_PARAM`, matching `sort ""` behavior. `--search` is trimmed; whitespace-only input is treated as no search filter.

`pipeline_tag` 47 enum (authority: /tasks page, exactly 47 slugs): any-to-any, audio-text-to-text, document-question-answering, visual-document-retrieval, image-text-to-text, image-text-to-image, image-text-to-video, video-text-to-text, visual-question-answering, feature-extraction, fill-mask, question-answering, sentence-similarity, summarization, table-question-answering, text-classification, text-generation, text-ranking, token-classification, translation, zero-shot-classification, depth-estimation, image-classification, image-feature-extraction, image-segmentation, image-to-image, image-to-text, image-to-video, keypoint-detection, mask-generation, object-detection, video-classification, text-to-image, text-to-video, unconditional-image-generation, video-to-video, zero-shot-image-classification, zero-shot-object-detection, text-to-3d, image-to-3d, audio-classification, audio-to-audio, automatic-speech-recognition, text-to-speech, tabular-classification, tabular-regression, reinforcement-learning.

## Failure Signals

- `sort` invalid value → API returns HTTP 400 with body `{"error":"✖ Invalid sort parameter: <value>"}`. Command pre-validates sort against the 5 CLI values.
- `pipeline_tag` invalid value → API returns HTTP 200 empty array. Command pre-validates against the 47 enum and throws `INVALID_PARAM` with the full enum list.
- `limit` out of 1-100 → command throws `INVALID_PARAM` (API does not clamp).
- Network/browser not available → daemon reports `BROWSER_ATTACH_REQUIRED` when no Chrome/Edge with remote debugging is connected.
- Polite pacing: 429/403 or CAPTCHA possible under rapid repeated requests. Command includes random waits and random mouse-move/scroll between steps; do not hammer.
- Missing `search` result / empty filter result → HTTP 200 empty array; command throws `EMPTY_RESULT` (aligned with `search`/`list-spaces`) so an AI caller can distinguish "no results" from a filter typo.
- JSON parse failure → throw `NETWORK_ERROR`.
- `page.goto` failure or in-page `fetch`/evaluate failure → wrapped and rethrown as `NETWORK_ERROR` (no raw Playwright error surfaces).

## Capture Assessment

This command should be captured: HF model listing is the highest-frequency HF data path, and no existing command can filter models by task (pipeline_tag), sort, keyword search, or author. It directly replaces the old `get-trending` scenario (default sort=trending) and adds dimensions. The path is fully verified end-to-end in explore with real data samples (sort mapping, filter combinations, author completeness, 47-value enum, limit bounds), is parameterizable, and is stable/reproducible via the in-page API. Capturing it saves repeated manual exploration and enables downstream chaining to `get-model`.
