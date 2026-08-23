# Context

## Precipitation Background (Why This Command Exists)

Part of a Hugging Face command family batch (see `docs/huggingface-commands-plan.md` section 12). The HF family had list/detail commands for models, datasets, Spaces, and papers but nothing for collections. Users needed a way to see a collection's content (title, description, author, and member items) before drilling into each item.

## Value Assessment

Collections group models/datasets/Spaces/papers around a theme. Reading a collection's item list with stable ids/urls is a frequent first step, and each item's id/url feeds directly into `get-model` / `get-dataset` / `get-space` / `get-paper` for chain calls. The internal API returns exact likes/downloads — far better than the abbreviated numbers shown on the page cards.

## Page Structure

- Collection page: `https://huggingface.co/collections/{user}/{slug}` (Svelte/JS-rendered; DOM is only a backup).
- Primary data source: `GET /api/collections/{user}/{slug}` (same-origin fetch from the attached browser; returns JSON with `title`, `description`, `owner{name, fullname}`, `items[]`, `upvotes`, `lastUpdated`).
- Item type matrix: `model` (likes + downloads), `dataset` (likes + downloads), `space` (likes only), `paper` (upvotes only; `id` = arXiv number), `bucket` (neither; has `size`/`totalFiles`).
- Item URL construction: model → `/{id}`, dataset → `/datasets/{id}`, space → `/spaces/{id}`, paper → `/papers/{id}`, bucket → `/buckets/{id}`.
- DOM backup selectors: `main h2` (title), `main div.mt-3.flex.items-center` (description), `main a.underline.decoration-gray-300` (author), `main article` (item cards; paper card class contains `group/paper`, repo cards `overview-card-wrapper` + `group/repo`).

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled; the daemon attaches via CDP. This is a separate CDP attach from any explore-phase `playwright-cli` session, and Chrome may show a one-time "allow remote debugging" confirmation prompt on first daemon connect.
- No login required for public collections.
- Command-line network cannot reach huggingface.co; all requests are same-origin `fetch` inside the browser.
- Polite pacing: random scroll + synthetic `mousemove` + random waits inside the page before fetching (kept light so as not to be noticeably slow).

## Failure Signals

- API 404 (`{"error":"Collection not found"}`) → `NOT_FOUND`.
- API non-200 / fetch throw → fall back to DOM extraction; if the DOM also has no title → `NETWORK_ERROR`.
- DOM cards show formatted numbers (e.g. "28.2k"), never rely on them for exact likes/downloads.
- The collection page has no JSON-LD and no `window.__INITIAL_STATE__`; use the API, not embedded globals.

## Repair Clues

- If the collection API path changes, open the network tab while loading `/collections/{user}/{slug}` to find the current endpoint.
- DOM backup selectors: `main h2` (title), `main div.mt-3.flex.items-center` (description), `main a.underline.decoration-gray-300` (author), `main article` (item cards).
- `page.goto` uses `waitUntil: "domcontentloaded"` to avoid slow third-party scripts; pair with the direct API fetch.
