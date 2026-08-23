# huggingface/list-discussions

List community discussions (open, including drafts) of a Hugging Face repo — model, dataset, or Space. Chains into `huggingface/get-discussion` via the returned `url`/`number`.

## Description

Fetches a repo's discussion threads via HF's internal discussions API (`/api/{models|datasets|spaces}/{repo}/discussions`) from inside the user's browser, so it works where direct command-line networking cannot reach huggingface.co. The repo type is auto-detected by probing `models` → `datasets` → `spaces`. Returns discussion threads with number, title, URL, author username, open time, comment count, and status. No login required.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `repo` | string | yes | - | Repo id of a model, dataset, or Space as `org/name` (e.g. `deepseek-ai/DeepSeek-R1`, `HuggingFaceFW/fineweb`, `multimodalart/minimax-h3`) or full URL `https://huggingface.co/deepseek-ai/DeepSeek-R1`. |
| `limit` | integer | no | 20 | Maximum discussions to return (1-100). The API returns a fixed 50/page; the command fetches enough pages and slices. |

## Return Value

```json
{
  "repo": "deepseek-ai/DeepSeek-R1",
  "type": "model",
  "count": 5,
  "total": 202,
  "items": [{
    "number": 255,
    "title": "Update README.md",
    "url": "https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255",
    "author": "shyamwertyajm",
    "opened_at": "2026-07-26T05:16:03.000Z",
    "comments_count": 1,
    "status": "open"
  }]
}
```

Notes:
- Only **open** discussions are listed by default (includes `draft` PRs, matching the page's default view); closed discussions are excluded.
- `type` is the auto-detected repo type: `model` | `dataset` | `space`.
- `total` is the total number of open discussions for the repo (from the API `count`); `count` is the number of items actually returned (after `limit` slicing).
- `url` includes the type prefix for datasets/spaces: `https://huggingface.co/datasets/{repo}/discussions/{num}`.
- `number` and `url` can be passed to `huggingface/get-discussion` for the full thread.

## Usage

```
websculpt huggingface list-discussions --repo deepseek-ai/DeepSeek-R1
websculpt huggingface list-discussions --repo deepseek-ai/DeepSeek-R1 --limit 5
websculpt huggingface list-discussions --repo HuggingFaceFW/fineweb --limit 30
websculpt huggingface list-discussions --repo multimodalart/minimax-h3 --limit 100
websculpt huggingface list-discussions --repo "https://huggingface.co/deepseek-ai/DeepSeek-R1"
```

## Common Error Codes

- `MISSING_PARAM` — `repo` is empty/missing.
- `INVALID_PARAM` — `repo` is not `org/name` (or a full URL), or `limit` is not a pure integer in 1-100.
- `NOT_FOUND` — repo does not exist (all three type endpoints return 404).
- `EMPTY_RESULT` — repo exists but has no open discussions.
- `NETWORK_ERROR` — could not reach huggingface.co from the browser, the in-page fetch failed, or the API returned non-200/unparseable.
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging is connected (produced by the daemon).
- `COMMAND_TIMEOUT` — command exceeded the 20-minute execution timeout (produced by the daemon).
