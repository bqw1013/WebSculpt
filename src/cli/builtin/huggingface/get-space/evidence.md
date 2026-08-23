# Evidence: huggingface/get-space

This document records the research and validation evidence for the `huggingface/get-space` command.

## Exploration Path

A prior explore workspace (`huggingface-get-space`) was completed and audited (`websculpt explore assess` returned `status: passed`, candidate `huggingface/get-space`).

Library check: the huggingface domain already ships `list-spaces` (list of Spaces with sdk/search/author filters) and `get-papers`/`list-models`/`list-datasets`/`search`. No single-Space detail command exists; `get-space` fills the list-to-detail gap as a sibling of the parallel `get-model` / `get-dataset` commands.

Browser automation: Playwright CLI session `<session>` attached to the user's Chrome (CDP), own tab on `https://huggingface.co/`, then page-internal `fetch('/api/spaces/{id}')` was used to obtain structured JSON. No DOM reading was needed. Command-line network (node https / curl) cannot reach huggingface.co (HTTP 000 timeout), so the command must reuse the browser's network.

## Verified URLs

- `https://huggingface.co/api/spaces/multimodalart/minimax-h3` -> HTTP 200, full Space detail JSON (sdk=gradio)
- `https://huggingface.co/api/spaces/victor/DeepSeek-V4-Flash-0731-free-endpoint` -> HTTP 200, sdk=static (host `*.static.hf.space`, runtime.hardware.current=null)
- `https://huggingface.co/api/spaces/LiquidAI/prompt-routing` -> HTTP 200, sdk=docker (hardware=cpu-basic)
- `https://huggingface.co/api/spaces?limit=100` -> HTTP 200, sdk distribution in top-100: gradio 73 / static 16 / docker 11 (no streamlit in top-100; streamlit is a known HF SDK value per list-spaces)
- `https://huggingface.co/api/spaces/this-org-does-not-exist-abc/this-space-does-not-exist-xyz` -> HTTP 404, body `{"error": "Repository not found"}`
- `https://huggingface.co/` -> page used as the fetch origin during exploration (own tab)

## Structural Evidence

`GET /api/spaces/{id}` returns a JSON object (verified against `multimodalart/minimax-h3`) with these 19 top-level fields:

```
_id, id, sdk, likes, tags, private, author, sha, lastModified,
cardData, subdomain, gated, disabled, host, models, runtime,
region, siblings, createdAt, usedStorage
```

Key field shapes (from real responses):

- `id`: string "org/name" (e.g. "multimodalart/minimax-h3")
- `author`: string (owner org/user)
- `likes`: integer (192)
- `sdk`: "gradio" | "static" | "docker" (streamlit is a known HF value); tags carry the sdk value as a tag plus a `region:*` tag, e.g. `["gradio","region:us"]`
- `subdomain`: string (e.g. "multimodalart-minimax-h3")
- `host`: string URL; static spaces use `https://<sub>.static.hf.space`, docker/gradio use `https://<sub>.hf.space`
- `models`: array of linked model ids (e.g. ["MiniMaxAI/MiniMax-H3", ...])
- `runtime`: nested object
  - `stage`: "RUNNING"
  - `hardware`: `{ current: "zero-a10g", requested: "zero-a10g" }`; for static spaces `current` and `requested` are null
  - `replicas`: `{ current: 2, requested: 1 }`
  - `domains`: array of `{ domain, stage }`
  - `sha`, `pySpacesVersion`, `gcTimeout`, `devMode` (present on gradio/docker runtimes)
- `region`: "us"
- `createdAt`, `lastModified`: ISO-8601 UTC strings
- `private`, `gated`, `disabled`: booleans
- `usedStorage`: number

Repo parameter normalization (verified against URL structure):
- `org/name` (e.g. `multimodalart/minimax-h3`) -> fetch `/api/spaces/org/name`
- full URL `https://huggingface.co/spaces/org/name` -> strip scheme/host and `/spaces/` prefix -> `org/name`
- query/hash stripped before normalization.

## Failure Signals

- HTTP 404 with `{"error": "Repository not found"}` -> Space does not exist -> map to `NOT_FOUND`.
- HTTP 429 -> rate-limited by HF -> map to `RATE_LIMITED`; command should throttle/retry-friendly.
- Other non-2xx / JSON parse failure / network failure -> `NETWORK_ERROR`.
- Empty or whitespace `repo` -> `MISSING_PARAM`.
- `repo` that is neither `org/name` nor a valid space URL (no slash, wrong host) -> `INVALID_PARAM`.
- Command-line node/curl cannot connect to huggingface.co; do not attempt. Browser attach required (`BROWSER_ATTACH_REQUIRED` is raised by the runner when Chrome remote debugging is off).
- Polite pacing: HF may throttle concurrent sessions; the command must add random waits / mouse movement / scrolling and keep a single navigation + single API call (target <=10s).

## Capture Assessment

This command should be captured. It turns the verified, repeatable path (attach user Chrome -> navigate to HF -> page-internal `fetch('/api/spaces/{id}')` -> 19-field JSON) into a reusable `huggingface/get-space` command. It covers the "after list-spaces, get full Space metadata (SDK, hardware/runtime, linked models, region)" gap, chains naturally from `list-spaces`, and is a sibling of the same-family `get-model` / `get-dataset` detail commands. The path was verified with real 200/404 responses during explore; it is stable and parameterizable by `repo`.
