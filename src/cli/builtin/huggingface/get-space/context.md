# Context

## Precipitation Background (Why This Command Exists)

The Hugging Face command family was missing a single-Space detail command.
`list-spaces` returns the list (id/url/likes/sdk/tags/trendingScore) but not the
rich detail a caller needs after picking a Space: runtime stage, hardware,
replicas, region, linked models, exact host/subdomain. `huggingface/get-space`
fills that list-to-detail gap, matching `get-model` / `get-dataset` siblings.

## Value Assessment

High reuse: any pipeline that starts from a Space list (or a Space URL seen in a
model card, discussion, or search result) needs this detail. The implementation is
a single browser navigation + one internal API call, so it is fast (target <=10s),
stable, and requires no login. It enables chaining: `list-spaces` -> `get-space`.

## Page Structure

- Origin page: `https://huggingface.co/spaces/{org}/{name}` (JS-rendered Space page; not parsed).
- Data source: page-internal `fetch('/api/spaces/{org}/{name}')` (same origin).
- Repo normalization: `org/name`, or full URL `https://huggingface.co/spaces/org/name`
  (scheme/host and optional `/spaces/` prefix and query/hash stripped).

## Environment Dependencies

- Browser attach required: `Requires Chrome or Edge running with remote debugging enabled. No login required.`
- Command-line node/curl cannot connect to huggingface.co; never attempt it.
- The daemon's CDP attach is independent of the explore-stage `@playwright/cli`
  session; first browser command may pop a "allow remote debugging" dialog that
  must be accepted before the connection succeeds.
- Polite pacing: random mouse movement, random scroll, and random wait before the
  API call; keep the whole command to one navigation + one API request.

## Failure Signals

- API HTTP 404 `{"error": "Repository not found"}` -> `NOT_FOUND`.
- API HTTP 429 -> `RATE_LIMITED` (HF throttling; reduce call frequency).
- Other non-2xx / JSON parse failure / network failure -> `NETWORK_ERROR`.
- Empty `repo` -> `MISSING_PARAM`; malformed `repo` -> `INVALID_PARAM`.
- If HF ever changes the API shape (fields missing/renamed), the pass-through
  still returns whatever the endpoint returns; callers should validate required fields.

## Repair Clues

- Fallback origin: navigate to `https://huggingface.co/` and fetch the same
  `/api/spaces/{id}` path if the Space page ever becomes slow or structurally changes.
- If the API stops returning the full object, the Space detail page (`/spaces/{id}`,
  JS-rendered) can supply sdk/likes/hardware via DOM as a degraded path.
- Field set is data-driven (pass-through): adding/removing API fields does not
  require a code change.
