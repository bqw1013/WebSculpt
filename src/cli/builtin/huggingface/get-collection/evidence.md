# Evidence: huggingface/get-collection

This document records the research and validation evidence for the `huggingface/get-collection` command.

## Exploration Path

Explored with Playwright CLI attached to the user's Chrome; browser session `<session>`. Command-line network (node https / curl) cannot reach huggingface.co, so all requests go through same-origin `fetch` inside the browser page.

Command library overlap checked: no existing command covers HF Collection detail (the `huggingface` family has list/detail commands for models/datasets/spaces/papers but not collections). A prior explore workspace passed audit (`status: passed`).

## Verified URLs

- `https://huggingface.co/collections/<hf-user>/<collection-slug>` (collection detail page, JS-rendered / Svelte; H2 = title, `div.mt-3.flex.items-center` = description, `a.underline.decoration-gray-300` = author, `main article` = item cards)
- `https://huggingface.co/collections/<hf-user>/<collection-slug>` (a second collection; model item card: `article.overview-card-wrapper.group/repo`, formatted text "mistralai/Mamba-Codestral-7B-v0.1 7B • Updated Jul 25, 2025 • 28.2k • 616")
- `https://huggingface.co/collections/<hf-user>/<collection-slug>` (a third collection; paper item card: `article.overview-card-wrapper.group/paper.rounded-sm!`, link `/papers/2603.25074`)
- `https://huggingface.co/<hf-user>/collections` (user collections list; multiple collection links)
- API (same-origin fetch, verified in browser):
  - `https://huggingface.co/api/collections/deepseek-ai/deepseek-v4` → 200 JSON
  - `https://huggingface.co/api/collections/<hf-user>/<collection-slug>` → model items with exact downloads/likes
  - `https://huggingface.co/api/collections/<hf-user>/<collection-slug>` (another collection) → space + bucket + paper items
  - `https://huggingface.co/api/collections/NoSuchUserXXX/no-such-slug-yyy` → 404 `{"error":"Collection not found"}`
  - Short slugs `deepseek-ai/deepseek-v4`, `MiniMaxAI/minimax-h3` → 200

## Structural Evidence

Primary data source is the internal API, not the DOM:

`GET /api/collections/{user}/{slug}` (same-origin fetch, browser required) returns JSON with:
- Top-level fields: `title`, `description`, `owner{name, fullname, avatarUrl, isPro, followerCount}`, `items[]`, `upvotes`, `lastUpdated`, `shareUrl`, `private`, `gating`
- `items[]` each have `type`, `id`, `position`, `author`, and type-specific fields.

Item type matrix (verified):
- `model`: has `downloads` + `likes` (exact numbers). Also `pipeline_tag`, `numParameters`, `gated`, `lastModified`.
- `dataset`: repo-type, same shape as model (`downloads` + `likes`); not directly observed in a sample but structurally identical repo item.
- `space`: has `likes`, NO `downloads`. Also `sdk`, `runtime`, `title`, `tags`.
- `paper`: likes field is `upvotes` (NOT `likes`), NO `downloads`. `id` is the arXiv number. Also `publishedAt`, `title`.
- `bucket`: NO `likes`, NO `downloads`. Has `size` (bytes), `totalFiles`.

URL construction by item type (verified against DOM hrefs):
- model → `https://huggingface.co/{id}` (no prefix)
- dataset → `https://huggingface.co/datasets/{id}`
- space → `https://huggingface.co/spaces/{id}`
- paper → `https://huggingface.co/papers/{id}`
- bucket → `https://huggingface.co/buckets/{id}`

Command flow: the command anchors on `https://huggingface.co/` (homepage, `domcontentloaded`) to establish a huggingface.co origin, fetches the collection API via same-origin `fetch`, and only navigates to the collection page for the DOM fallback when the API returns an unexpected status. This keeps the non-existent-collection (404) path fast by avoiding the slow Svelte 404 page load.

Collection page DOM (backup only, formatted numbers not exact):
- Title: `main h2`
- Description: `main div.mt-3.flex.items-center` (equals `meta[property="og:description"]`)
- Author: `main a.underline.decoration-gray-300` (text = username) + " 's Collections"
- Items: `main article` cards; paper card class contains `group/paper`, repo cards `overview-card-wrapper` + `group/repo`
- DOM likes/downloads are abbreviated ("28.2k"), so API is preferred.

## Failure Signals

- Non-existent collection: API returns HTTP 404 with `{"error":"Collection not found"}` → map to `NOT_FOUND`.
- Empty/invalid `collection` param: `MISSING_PARAM` (empty) / `INVALID_PARAM` (unparseable format).
- No CAPTCHA / 429 / 403 observed during exploration (multiple consecutive same-origin fetches all returned 200).
- DOM cards only show formatted abbreviation for likes/downloads; do not rely on DOM for exact numbers.
- Page is Svelte/JS-rendered; no JSON-LD and no `window.__INITIAL_STATE__`; rely on the API.
- `page.goto` may be slow if waiting for full load; use `domcontentloaded` and fetch directly.

## Capture Assessment

This command should be captured. `huggingface/get-collection` fills a clear gap (collection detail) in the HF command family, has a stable internal API path (`/api/collections/{user}/{slug}`), returns structured, chainable output (item id/url feed into get-model/get-dataset/get-space/get-paper), and the contract was confirmed by the user.
