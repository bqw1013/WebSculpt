# huggingface/search

Search Hugging Face models, datasets, and Spaces by keyword, merging results from HF's list APIs.

## Description

Cross-type keyword search over Hugging Face Hub. `type=all` (default) merges `/api/models?search=` + `/api/datasets?search=` + `/api/spaces?search=`; a single type queries only that API. The keyword matches repo name/metadata/tags (same semantics as the search box on `/models`, `/datasets`, `/spaces`), **not README full-text**. Returns items with type, id, url, likes, downloads, tags (plus `pipeline_tag` for models and `sdk` for Spaces). Browser runtime; no login required.

## Parameters

- `query` (string, required): Search keyword, e.g. `vision transformer`.（搜索关键词，必填。）
- `type` (string, optional, default `all`): `all`(全部) | `model`(模型) | `dataset`(数据集) | `space`(Space). `all` merges the three list APIs; a single type queries only that API.
- `limit` (number, optional, default `20`): Maximum results per type (1-100).（每种类型返回条数上限。）

## Return Value

```json
{
  "query": "vision transformer",
  "type": "all",
  "items": [
    {
      "type": "model",
      "id": "org/name",
      "url": "https://huggingface.co/org/name",
      "likes": 1,
      "downloads": 17,
      "tags": ["transformers", "vit"],
      "pipeline_tag": "image-classification"
    },
    {
      "type": "dataset",
      "id": "org/name",
      "url": "https://huggingface.co/datasets/org/name",
      "likes": 0,
      "downloads": 91,
      "tags": ["license:mit"]
    },
    {
      "type": "space",
      "id": "org/name",
      "url": "https://huggingface.co/spaces/org/name",
      "likes": 0,
      "downloads": 0,
      "tags": ["gradio"],
      "sdk": "gradio"
    }
  ],
  "count": 9
}
```

`count` = total returned items (sum across types when `type=all`). Spaces have no `downloads` in the list API (fixed 0). For `type=all`, items are ordered models → datasets → spaces, preserving each API's own ranking. Model URLs are canonical `https://huggingface.co/{org}/{name}` (no `/models/` prefix — that path returns HTTP 404); dataset/space URLs keep their `/datasets/` and `/spaces/` prefixes.

## Usage

```
websculpt huggingface search --query "vision transformer"
websculpt huggingface search --query "vit" --type model --limit 5
websculpt huggingface search --query "fineweb" --type dataset
websculpt huggingface search --query "text-generation" --type space
```

## Common Error Codes

- `MISSING_PARAM` — `query` missing or blank.
- `INVALID_PARAM` — `type` not in `all/model/dataset/space`, or `limit` not an integer in 1-100.
- `EMPTY_RESULT` — no results for the query in the requested type(s).
- `NETWORK_ERROR` — HF list API returned non-200 or the in-page fetch failed.
- `BROWSER_ATTACH_REQUIRED` — browser not connected (daemon-produced).
