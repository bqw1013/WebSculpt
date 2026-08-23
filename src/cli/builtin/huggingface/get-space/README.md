# huggingface/get-space

Fetch a single Hugging Face Space's full metadata by repo id.

## Description

Reads a Space's detail from HF's internal `/api/spaces/{id}` API in the user's
browser (the command-line network cannot reach huggingface.co). Returns the full
Space metadata: likes, SDK type, tags, linked models, runtime (stage/hardware/replicas),
region, host/subdomain, and created/updated dates. Complements `huggingface/list-spaces`.

## Parameters

| name   | required | description |
|--------|----------|-------------|
| `repo` | yes      | Space repo as `org/name` (e.g. `multimodalart/minimax-h3`) or a full URL `https://huggingface.co/spaces/multimodalart/minimax-h3`. |

## Return Value

The full `/api/spaces/{id}` JSON object, passed through as-is:

```json
{
  "id": "multimodalart/minimax-h3",
  "author": "multimodalart",
  "likes": 192,
  "sdk": "gradio",
  "tags": ["gradio", "region:us"],
  "subdomain": "multimodalart-minimax-h3",
  "host": "https://multimodalart-minimax-h3.hf.space",
  "models": ["MiniMaxAI/MiniMax-H3"],
  "runtime": { "stage": "RUNNING", "hardware": { "current": "zero-a10g", "requested": "zero-a10g" }, "replicas": { "current": 2, "requested": 1 } },
  "region": "us",
  "createdAt": "2026-08-02T06:05:03.000Z",
  "lastModified": "2026-08-07T18:58:43.000Z"
}
```

Also present when the API returns them: `sha`, `private`, `gated`, `disabled`, `cardData`, `siblings`, `usedStorage`, `_id`.

## Usage

```bash
# by org/name
websculpt huggingface get-space --repo multimodalart/minimax-h3

# by full URL
websculpt huggingface get-space --repo https://huggingface.co/spaces/multimodalart/minimax-h3
```

## Common Error Codes

- `MISSING_PARAM` — `repo` is empty.
- `INVALID_PARAM` — `repo` is neither `org/name` nor a valid space URL.
- `NOT_FOUND` — the Space does not exist (API HTTP 404).
- `RATE_LIMITED` — HF throttled the request (HTTP 429).
- `NETWORK_ERROR` — other non-2xx response or JSON/network failure.
- `BROWSER_ATTACH_REQUIRED` — raised by the runner when no browser with remote debugging is attached.
