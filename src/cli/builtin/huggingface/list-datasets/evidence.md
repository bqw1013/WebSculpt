# Evidence: huggingface/list-datasets

This document records the research and validation evidence for the `huggingface/list-datasets` command.

## Exploration Path

Explored via the `websculpt-explore` skill (explore assess passed). Used `@playwright/cli` 0.1.13 to attach the user's Chrome (session `<session>`), then verified the path with page-internal `fetch('/api/datasets?...')`. The command runtime is `browser` (daemon `connectOverCDP` attach), which is a separate CDP attach from the explore-phase `@playwright/cli` session.

Command library overlap checked: `websculpt command list huggingface` shows existing `huggingface/get-trending` (DOM-card datasets list, only type/sort) and `huggingface/get-papers`. `list-datasets` extends with search/sort/author filters and structured JSON; no name conflict.

## Verified URLs

All fetched in-page (browser-internal same-origin fetch; command-line node/curl cannot reach huggingface.co — verified HTTP 000 timeout during explore, so this command never uses the Node network):

- `https://huggingface.co/datasets` — SSR list page, used only as the same-origin anchor tab for in-page fetch.
- `https://huggingface.co/api/datasets?limit=3` — returns array; first item `HuggingFaceFW/fineweb`.
- `https://huggingface.co/api/datasets?search=fineweb&limit=3` — search filter works.
- `https://huggingface.co/api/datasets?sort=likes&limit=3` (also `sort=downloads`, `sort=createdAt`, `sort=lastModified`, `sort=trendingScore`) — valid sort values, ordering changes.
- `https://huggingface.co/api/datasets?sort=trending&limit=3` (also `created`, `modified`) — returns `{"error":"✖ Invalid sort parameter: X"}`; these are NOT valid API sort tokens.
- `https://huggingface.co/api/datasets?author=HuggingFaceFW&limit=5` and `?author=<hf-user>&limit=5` — author filter works.
- `https://huggingface.co/api/datasets?search=fineweb&sort=likes&limit=5` — combined filters work.
- `https://huggingface.co/api/datasets?search=zzzznonexistentkeyword999&limit=5` and `?author=NoSuchAuthorXyz999` — return `[]` (empty array), not an error.
- `https://huggingface.co/api/datasets?limit=150` — returns 150 items; API does not hard-cap, so the command clamps limit to 1-100.

## Structural Evidence

API endpoint: `GET /api/datasets` (same-origin, page-internal fetch). Query params verified: `search`, `sort`, `author`, `limit`.

Response is a JSON array of dataset objects. Verified fields (no `url` field — command must build `https://huggingface.co/datasets/{id}`):
`_id, id, author, disabled, gated, lastModified, likes, trendingScore, private, sha, description, downloads, tags, createdAt, key`.

Sort token mapping (CLI-facing enum → API token):
- `trending` (default) → omit sort param (API default order = trendingScore; verified `?limit=3` and `?sort=trendingScore&limit=2` both return `HuggingFaceFW/fineweb` first)
- `likes` → `likes`
- `downloads` → `downloads`
- `created` → `createdAt`
- `modified` → `lastModified`

Invalid API sort tokens (would 400 with `{"error":"✖ Invalid sort parameter: X"}`): `trending`, `created`, `modified`, `updated`, `name`, `author`, `modifiedAt`, `lastModifiedAt`. Command must never pass these to the API.

Tags structure (dataset-specific dimensions language/size_categories live here, not as separate params):
`task_categories:*`, `language:*`, `license:*`, `size_categories:*`, plus `modality:*`, `arxiv:*`, `doi:*`, `region:*`, `format:*`, `library:*`. Tags arrays can be very large (e.g. `HuggingFaceFW/fineweb-2` has hundreds of `language:xx` entries); output keeps the full tags array.

Sample item (search=fineweb, real data):
```json
{
  "id": "HuggingFaceFW/fineweb",
  "url": "https://huggingface.co/datasets/HuggingFaceFW/fineweb",
  "likes": 3133, "downloads": 378620, "trendingScore": 125,
  "tags": ["task_categories:text-generation","language:en","license:odc-by","size_categories:10B<n<100B","modality:tabular","modality:text","arxiv:2306.01116","arxiv:2109.07445","arxiv:2406.17557","doi:10.57967/hf/2493","region:us"],
  "createdAt": "2024-04-18T14:33:13.000Z",
  "lastModified": "2025-07-11T20:16:53.000Z"
}
```

Empty-result behavior: `search`/`author` with no matches return `[]` (length 0) — command maps this to `EMPTY_RESULT`. Invalid sort returns an error object — command prevents this by validating before fetch (`INVALID_PARAM`).

## Failure Signals

- `{"error":"✖ Invalid sort parameter: X"}` — API rejects unknown sort token; prevented by pre-validating the CLI enum.
- Response not an array / response has `error` key — API-level error; treat as `NETWORK_ERROR`/`INVALID_PARAM` and surface the API message.
- Network failure or non-200 from `page.evaluate` fetch — surfaced as `NETWORK_ERROR`.
- Browser not attached / daemon cannot connect over CDP — runner returns `BROWSER_ATTACH_REQUIRED` (not thrown by command code).
- Rate-limit signals (429/403/CAPTCHA) not observed during explore (all requests 200); command still applies random scroll/mouse-move/random wait polite pacing (user hard requirement) but keeps total runtime ≤10s.
- Empty `items` is a valid business result (EMPTY_RESULT), distinct from transport/parameter errors.

## Capture Assessment

Capture as `huggingface/list-datasets` (browser runtime). The path is fully verified with real data in explore, the API contract is stable and structured, and the command fills a real gap (searchable/sortable/author-filterable dataset index with tags) not covered by existing `get-trending` (DOM-only, no filters). It is parameterizable (`search/sort/author/limit`) and reusable on demand. No login required.
