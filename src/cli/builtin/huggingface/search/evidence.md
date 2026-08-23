# Evidence: huggingface/search

This document records the research and validation evidence for the `huggingface/search` command.

## Exploration Path

Explored via `websculpt-explore` (assess passed). Command library check: `huggingface` domain has `get-trending` and `get-papers`; neither covers cross-type keyword search → new command. Browser used: Playwright CLI attached to the user's Chrome via CDP; all data extracted with in-page `fetch('/api/...')` (same-origin). Command-line networking (node https / curl) cannot reach huggingface.co, so browser runtime is required. Polite pacing: random mouse move / scroll / random waits between fetches; no 429/403/CAPTCHA observed during exploration (~15 requests, all 200).

## Verified URLs

- https://huggingface.co/models (navigated as the initial page; SSR list page, gives same-origin for API fetch)
- https://huggingface.co/api/models?search=vision+transformer&limit=3 (200, JSON array; rate-limit headers q=1000/w=300)
- https://huggingface.co/api/datasets?search=vision+transformer&limit=3 (200, JSON array)
- https://huggingface.co/api/spaces?search=vision+transformer&limit=3 (200, JSON array)
- https://huggingface.co/api/models?search=vision+transformer&limit=20 (200; names containing "vision transformer"; does NOT include google/vit)
- https://huggingface.co/api/models?search=vit&limit=8 (200; includes google/vit-base-patch16-224, facebook/dinov3-vitl16-pretrain-*, openai/clip-vit-large-patch14)
- https://huggingface.co/api/models?search=zzqqxxnonexistentkeyword&limit=5 (200; returns `[]`)
- https://huggingface.co/search/full-text?q=vision+transformer&type=model (full-text content search page; 38,073 results; 20 cards/page via `?p=N`; Tailwind divs; evaluated and REJECTED as data source — no stable JSON API, fragile DOM)
- https://huggingface.co/search/full-text?q=vision+transformer (no type → 75,525 results, defaults to all types)

## Structural Evidence

Three HF list APIs, each returning a bare JSON array:

- `/api/models?search=<q>&limit=<n>` → items with `id, author, downloads, likes, trendingScore, pipeline_tag, library_name, tags[], createdAt, lastModified, private, gated, sha, siblings, _id`.
- `/api/datasets?search=<q>&limit=<n>` → items with `id, author, downloads, likes, trendingScore, tags[], createdAt, lastModified, private, gated, disabled, sha, key`.
- `/api/spaces?search=<q>&limit=<n>` → items with `id, likes, trendingScore, sdk (gradio/streamlit/static), tags[], createdAt, private, _id`. **No `downloads` field.**

Verified facts:

- `?search=` is a keyword filter on repo name/metadata/tags (same semantics as the search box on /models, /datasets, /spaces), **NOT README full-text**: `search=vision+transformer` does not return `google/vit` (its name is just "vit"), while `search=vit` does.
- Empty results return `[]` → `EMPTY_RESULT` is distinguishable from success.
- `limit` is enforced directly (limit=2 → 2 items; 1-100 accepted).
- Response body contains no `url` or `snippet` → `url` must be constructed. Canonical model URL is `https://huggingface.co/{id}` (verified: `https://huggingface.co/models/{id}` returns HTTP 404, `https://huggingface.co/{id}` returns 200); datasets/spaces use `https://huggingface.co/{datasets|spaces}/{id}`.
- Rate limit observed: `ratelimit: "api";r=989;t=250`, `ratelimit-policy: "fixed window";"api";q=1000;w=300` → 1000 req / 300s quota; this command uses 1-3 requests per invocation.
- `access-control-expose-headers` lists `X-Total-Count`, but the models list response actually carries no such header → no total-count dependency in the contract.
- `Link` header carries `rel="next"` + `cursor` → cursor pagination exists; command takes the first page only (per-type `limit`).
- `full=true` on the list API does NOT trigger full-text content search (returns the same metadata shape).

Merged output (type=all) verified end-to-end for query "vision transformer", limit=3: 9 items (3 model + 3 dataset + 3 space), each with `type/id/url/likes/downloads/tags`; models add `pipeline_tag`, spaces add `sdk`. `(type, id)` is unique across the three type scopes (HF allows the same name across types, so `id` alone is not globally unique).

## Failure Signals

- Non-200 from any queried list API → `NETWORK_ERROR` (surface the HTTP status).
- All queried types return empty → `EMPTY_RESULT` (throw, not empty success).
- Missing or blank `query` → `MISSING_PARAM`.
- `type` not in `all/model/dataset/space` → `INVALID_PARAM`.
- `limit` not an integer in 1-100 → `INVALID_PARAM`.
- Browser not attached → `BROWSER_ATTACH_REQUIRED` (daemon-produced, not thrown by command).
- HF structure change (list API path moved or JSON shape changed) → in-page fetch fails or unexpected shape → `NETWORK_ERROR`; repair by re-verifying the API paths in the browser.
- Polite pacing: if 429/403/CAPTCHA is observed, increase the jittered delays between the concurrent fetches.

## Capture Assessment

This command should be captured. It converts the verified three-list-API merge path into a reusable, parameterized CLI command (`query`/`type`/`limit`) matching plan §13. It is stable (structured JSON, no DOM parsing), rate-limit-friendly (1-3 requests/invocation against a 1000/300s quota), and complements the new `list-models`/`list-datasets`/`list-spaces` commands. Browser runtime is required because command-line networking cannot reach huggingface.co.
