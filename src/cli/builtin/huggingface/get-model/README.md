# huggingface/get-model

Fetch a Hugging Face model's full metadata by repo id (e.g. `deepseek-ai/DeepSeek-R1` or a full URL), plus optional README text. Reads via HF's internal API from the browser (in-page fetch); no login required.

## Description

Returns downloads, likes, pipeline task, library, tags (including license and arXiv), model card data, safetensors size, file list (siblings), Spaces using this model, and created/updated dates. Pass `--include_readme true` to also return the README text.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `repo` | yes | — | Model repo as `org/name` (e.g. `deepseek-ai/DeepSeek-R1`) or full URL `https://huggingface.co/deepseek-ai/DeepSeek-R1`. (模型仓库标识：`org/name` 或完整 URL。) |
| `include_readme` | no | `false` | Set to `true` to also return the model README text. README is fetched separately and may fail for gated/private models — in that case `readme` is `null` and `readmeError` carries the status/reason. (是否同时返回 README 全文；README 单独获取，gated/私有模型可能取不到。) |

## Return Value

```json
{
  "id": "deepseek-ai/DeepSeek-R1",
  "url": "https://huggingface.co/deepseek-ai/DeepSeek-R1",
  "author": "deepseek-ai",
  "sha": "56d4cbbb4d29f4355bab4b9a39ccb717a14ad5ad",
  "downloads": 8848933,
  "likes": 13554,
  "private": false,
  "gated": false,
  "pipeline_tag": "text-generation",
  "library_name": "transformers",
  "tags": ["transformers", "safetensors", "arxiv:2501.12948", "license:mit"],
  "cardData": { "license": "mit", "library_name": "transformers" },
  "safetensors": { "total": 684531386000, "parameters": { "BF16": 3918786560, "F8_E4M3": 680571043840, "F32": 41555600 } },
  "siblings": [{ "rfilename": ".gitattributes" }, { "rfilename": "README.md" }],
  "spaces": ["pliny-the-prompter/obliteratus"],
  "createdAt": "2025-01-20T03:46:07.000Z",
  "lastModified": "2025-03-27T04:01:59.000Z",
  "readme": "---\nlicense: mit\n...\n# DeepSeek-R1\n...",              // only when include_readme=true and fetch succeeds
  "readmeError": { "status": 403, "reason": "Access ... restricted" }   // only when include_readme=true and README unavailable
}
```

## Usage

```
websculpt huggingface get-model --repo deepseek-ai/DeepSeek-R1
websculpt huggingface get-model --repo https://huggingface.co/deepseek-ai/DeepSeek-R1 --include_readme true
```

## Common Error Codes

- `MISSING_PARAM` — `repo` parameter missing or empty.
- `INVALID_PARAM` — `repo` is neither `org/name` nor a valid `https://huggingface.co/...` URL.
- `NOT_FOUND` — model does not exist (HF API 404).
- `NETWORK_ERROR` — HF model API returned a non-200/non-404 status, or the browser could not reach huggingface.co.
- `BROWSER_ATTACH_REQUIRED` — browser not attached (daemon-produced; run with Chrome/Edge remote debugging enabled).
