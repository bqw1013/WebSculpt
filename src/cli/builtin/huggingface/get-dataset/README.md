# huggingface/get-dataset

Fetch a Hugging Face dataset's full metadata by repo id, e.g. `HuggingFaceFW/fineweb` (or full URL `https://huggingface.co/datasets/HuggingFaceFW/fineweb`).

## Description

Fetches a HF dataset's complete metadata via the internal API (`/api/datasets/{id}`) from inside the user's browser, so it works where direct command-line networking cannot reach huggingface.co. Returns downloads, likes, tags (task categories, language, license, size categories), description, card data, file list, storage usage, and created/updated dates. No login required.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `repo` | string | yes | - | Dataset repo as `org/name` (e.g. `HuggingFaceFW/fineweb`) or full URL `https://huggingface.co/datasets/HuggingFaceFW/fineweb`. （数据集仓库标识：`org/name` 或完整 URL，两种形式均可。） |

## Return Value

```json
{
  "id": "HuggingFaceFW/fineweb",
  "author": "HuggingFaceFW",
  "sha": "9bb295ddab0e05d785b879661af7260fed5140fc",
  "downloads": 378620,
  "likes": 3133,
  "private": false,
  "gated": false,
  "tags": [
    "task_categories:text-generation",
    "language:en",
    "license:odc-by",
    "size_categories:10B<n<100B",
    "modality:text",
    "arxiv:2306.01116",
    "doi:10.57967/hf/2493",
    "region:us"
  ],
  "description": "...",
  "cardData": { "license": "odc-by", "task_categories": "text-generation", "...": "..." },
  "siblings": [ { "rfilename": ".gitattributes" }, { "rfilename": "README.md" }, "..." ],
  "createdAt": "2024-04-18T14:33:13.000Z",
  "lastModified": "2025-07-11T20:16:53.000Z",
  "usedStorage": 117390103814494
}
```

`tags` is an array of `key:value` strings. The core categories `task_categories:`, `language:`, `license:`, `size_categories:` are always present; other tags vary by dataset (`modality:`, `arxiv:`, `doi:`, `region:`, `library:*`, `format:*`, `benchmark:*`, ...). `cardData` shape varies per dataset and is passed through as-is.

## Usage

```
websculpt huggingface get-dataset --repo HuggingFaceFW/fineweb
websculpt huggingface get-dataset --repo https://huggingface.co/datasets/HuggingFaceFW/fineweb
websculpt huggingface get-dataset --repo openai/gsm8k
```

## Common Error Codes

- `MISSING_PARAM` — `repo` is empty/omitted.
- `INVALID_PARAM` — `repo` is not `org/name` or a valid HF dataset URL.
- `NOT_FOUND` — dataset does not exist (HTTP 404).
- `NETWORK_ERROR` — cannot reach huggingface.co or the in-page API fetch failed.
- `DRIFT_DETECTED` — unexpected `/api/datasets/{id}` response shape.
