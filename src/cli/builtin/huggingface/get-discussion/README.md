# huggingface/get-discussion

Fetch a single community discussion of a Hugging Face repo (model / dataset / Space) by number.

## Description

Returns the discussion's title, author, open time, opening-post body, reply comment thread, and — for pull-request discussions only — a file-changes summary (`files_changed` is `null` for normal discussions). Data is read from HF's internal discussion API via in-page fetch in the user's browser (browser runtime; command-line networking cannot reach huggingface.co). No login required.

## Parameters

- `repo` (string, required): model/dataset/Space repo id as `org/name` (e.g. `deepseek-ai/DeepSeek-R1`, `HuggingFaceFW/fineweb`, `multimodalart/minimax-h3`) or a full URL. The repo type is auto-detected by probing the `models` → `datasets` → `spaces` API prefixes.
- `number` (integer, required): discussion number (e.g. `255`), from the `/discussions/255` URL or the `list-discussions` output.

## Return Value

```json
{
  "repo": "deepseek-ai/DeepSeek-R1",
  "type": "model",
  "number": 255,
  "title": "Update README.md",
  "url": "https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255",
  "status": "open",
  "is_pull_request": true,
  "author": "shyamwertyajm",
  "author_fullname": "Shyam Narayan",
  "opened_at": "2026-07-26T05:16:03.000Z",
  "body": "",
  "files_changed": {
    "diff_url": "https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255/files.diff",
    "files": [{ "file": "README.md", "additions": 6, "deletions": 0 }]
  },
  "comments": [{ "author": "xujfcn", "at": "2026-02-26T10:00:12.000Z", "body": "...", "hidden": false }]
}
```

- `type`: resolved repo type `model` / `dataset` / `space`.
- `body`: opening-post text (first comment event, markdown source; PR discussions are often empty).
- `comments`: reply comments only (non-`comment` events such as `commit`/`title-change` are skipped); `hidden` flags hidden comments.
- `files_changed`: present only for pull-request discussions; `null` for normal discussions (not an error).

## Usage

```
websculpt huggingface get-discussion --repo deepseek-ai/DeepSeek-R1 --number 255
websculpt huggingface get-discussion --repo HuggingFaceFW/fineweb --number 49
websculpt huggingface get-discussion --repo multimodalart/minimax-h3 --number 8
```

## Common Error Codes

- `INVALID_PARAM` — `repo` is not `org/name` (or full URL) or `number` is not a positive integer.
- `NOT_FOUND` — the repo does not exist, or the discussion number was not found on that repo.
- `NETWORK_ERROR` — failed to reach huggingface.co or the in-page API/diff fetch failed.
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging is connected (raised by the daemon).
