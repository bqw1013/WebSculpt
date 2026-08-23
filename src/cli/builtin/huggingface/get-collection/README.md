# huggingface/get-collection

Fetch a Hugging Face collection's detail: title, description, author, upvotes, last updated time, and every item in the collection (models, datasets, Spaces, papers, buckets).

## Description

Reads `https://huggingface.co/api/collections/{user}/{slug}` via a same-origin fetch inside the attached browser and returns the collection metadata plus a normalized item list. Requires Chrome/Edge with remote debugging enabled; no login needed for public collections.

## Parameters

| name | type | required | description |
|---|---|---|---|
| `collection` | string | yes | Collection id as `user/slug` (e.g. `deepseek-ai/deepseek-v4`) or full URL `https://huggingface.co/collections/deepseek-ai/deepseek-v4`. 收藏集标识：`user/slug` 或完整 URL 两种形式均接受，命令自动解析出 `user/slug`。 |

## Return Value

```json
{
  "id": "<hf-user>/<collection-slug>",
  "title": "<title>",
  "description": "<description>",
  "author": "<hf-user>",
  "author_fullname": "<display name>",
  "url": "https://huggingface.co/collections/<hf-user>/<collection-slug>",
  "upvotes": 0,
  "lastUpdated": "2026-07-21T07:15:27.806Z",
  "itemCount": 2,
  "items": [
    {
      "type": "space",
      "id": "<hf-user>/<space-name>",
      "url": "https://huggingface.co/spaces/<hf-user>/<space-name>",
      "likes": 0,
      "downloads": null
    }
  ]
}
```

`item.type` is one of `model | dataset | space | paper | bucket`. `likes`/`downloads` are `null` for item types that do not expose them: `space` has `likes` but no `downloads`; `paper`'s like count comes from its `upvotes`; `bucket` has neither (only a `size`).

## Usage

```
websculpt huggingface get-collection --collection deepseek-ai/deepseek-v4
websculpt huggingface get-collection --collection https://huggingface.co/collections/deepseek-ai/deepseek-v4
```

## Common Error Codes

- `MISSING_PARAM` — `collection` not provided or empty.
- `INVALID_PARAM` — `collection` is neither `user/slug` nor a valid collections URL.
- `NOT_FOUND` — the collection does not exist (API returned 404).
- `NETWORK_ERROR` — page navigation or API fetch failed.
- `BROWSER_ATTACH_REQUIRED` — no browser attached (raised by the daemon before the command runs).
