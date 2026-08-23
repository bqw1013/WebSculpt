# huggingface/list-datasets

List Hugging Face datasets with keyword search, sort order, and author filtering.

## Description

Fetches the Hugging Face dataset index via HF's internal API (`/api/datasets`) from inside the browser. Returns ranked dataset entries with id, url, likes, downloads, trendingScore, the full tags array (task_categories, language, license, size_categories, modality, arxiv, region, ...), and created/updated dates. Command-line network cannot reach huggingface.co, so this command requires a browser and runs its fetch in the page.

## Parameters

| name     | type   | required | default   | description |
|----------|--------|----------|-----------|-------------|
| search   | string | no       | -         | Keyword search within datasets (`?search=`). |
| sort     | enum   | no       | trending  | `trending`(趋势) / `likes`(点赞最多) / `downloads`(下载最多) / `created`(最新创建) / `modified`(最近更新). Internally mapped to API tokens trendingScore/likes/downloads/createdAt/lastModified. |
| author   | string | no       | -         | List all datasets by one author/organization (`?author=`). |
| limit    | integer| no       | 20        | Maximum datasets to return (a plain positive integer, 1-100). Non-integer strings such as `1.5`/`1e3`/`2abc` are rejected with `INVALID_PARAM`. |

## Return Value

```json
{
  "items": [
    {
      "id": "HuggingFaceFW/fineweb",
      "url": "https://huggingface.co/datasets/HuggingFaceFW/fineweb",
      "likes": 3133,
      "downloads": 378620,
      "trendingScore": 125,
      "tags": ["task_categories:text-generation", "language:en", "license:odc-by", "size_categories:10B<n<100B", "..."],
      "createdAt": "2024-04-18T14:33:13.000Z",
      "lastModified": "2025-07-11T20:16:53.000Z"
    }
  ],
  "count": 1,
  "filters": { "search": "fineweb", "sort": "trending", "author": null }
}
```

`url` is constructed from `id` (the API does not return a url field). `tags` is kept complete; language/size_categories are represented as tags, not separate parameters.

## Usage

```
websculpt huggingface list-datasets
websculpt huggingface list-datasets --search fineweb --limit 5
websculpt huggingface list-datasets --sort likes --limit 10
websculpt huggingface list-datasets --author HuggingFaceFW
websculpt huggingface list-datasets --search fineweb --sort downloads --limit 3
```

## Common Error Codes

- `INVALID_PARAM` — sort is not one of trending/likes/downloads/created/modified, or limit is not a plain integer between 1 and 100. `sort` is trimmed before validation, so `--sort " likes "` is accepted.
- `EMPTY_RESULT` — request succeeded but no datasets matched the filters.
- `BROWSER_ATTACH_REQUIRED` — no browser is attached (daemon/runtime error).
- `NETWORK_ERROR` — the in-page fetch failed or the API returned an error.
