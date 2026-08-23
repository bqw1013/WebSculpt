# huggingface/list-models

List Hugging Face models with filtering by task (pipeline_tag), sort order, keyword search, and author. Default `sort=trending` covers the old `get-trending` scenario.

## Description

Fetches the HF model index via the internal list API (`/api/models?...`) from inside the user's browser, so it works where direct command-line networking cannot reach huggingface.co. Returns ranked model entries with id, url, likes, downloads, trending score, pipeline task, library, tags, and created/updated dates. No login required.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `pipeline_tag` | string (enum) | no | - (all) | Task type filter. All 47 HF task slugs, e.g. `text-generation`, `text-to-image`, `automatic-speech-recognition`, `reinforcement-learning`. Full 47-value list with Chinese labels is in the manifest parameter description. |
| `sort` | string (enum) | no | trending | `trending`(趋势) / `likes`(点赞) / `downloads`(下载) / `created`(最新创建) / `modified`(最近更新). |
| `search` | string | no | - | Keyword search (matches the /models page search box). |
| `author` | string | no | - | List all models by one author/organization (e.g. `deepseek-ai`). |
| `limit` | integer | no | 20 | Maximum models to return (1-100). |

## Return Value

```json
{
  "items": [{
    "id": "deepseek-ai/DeepSeek-R1",
    "url": "https://huggingface.co/deepseek-ai/DeepSeek-R1",
    "likes": 2905,
    "downloads": 868576,
    "trendingScore": 1081,
    "pipeline_tag": "text-generation",
    "library_name": "transformers",
    "tags": ["transformers", "safetensors", "license:mit"],
    "createdAt": "2026-07-31T07:30:24.000Z",
    "lastModified": null,
    "author": "deepseek-ai"
  }],
  "count": 1,
  "filters": { "pipeline_tag": null, "sort": "trending", "search": null, "author": "deepseek-ai" }
}
```

Notes:
- `trendingScore` is populated only when `sort=trending`; `lastModified` only when `sort=modified` (HF API behavior). Other sorts leave these `null`.
- `url` is derived from `id`; `author` is derived from the `org/` prefix of `id`.
- A filter with no matches (e.g. a non-existent `author`) throws `EMPTY_RESULT` instead of returning an empty list.
- A whitespace-only `--search " "` is treated as no search filter (`filters.search` is `null`).

## Usage

```
websculpt huggingface list-models
websculpt huggingface list-models --pipeline_tag text-generation --sort likes --limit 10
websculpt huggingface list-models --author deepseek-ai --sort likes
websculpt huggingface list-models --search "vision transformer" --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — invalid `pipeline_tag` (not one of the 47 slugs, or empty), invalid `sort`, or `limit` not a pure integer in 1-100.
- `EMPTY_RESULT` — no models match the given filters (e.g. a non-existent `author`).
- `NETWORK_ERROR` — could not reach huggingface.co from the browser, the in-page fetch failed, or the list API returned non-200/unparseable.
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging is connected (produced by the daemon).
- `COMMAND_TIMEOUT` — command exceeded the 20-minute execution timeout (produced by the daemon).
