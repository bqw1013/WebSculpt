# huggingface/list-spaces

List Hugging Face Spaces with filtering by SDK type (`gradio`/`streamlit`/`static`/`docker`), keyword search, and author. Returns ranked Space entries with a fixed key set: id, url, likes, sdk, author, createdAt, tags, trendingScore, lastModified, description, title. Which fields are filled depends on the data path and is documented below.

## Description

Fetches the HF Space index from inside the user's browser, so it works where direct command-line networking cannot reach huggingface.co. The `sdk` filter is applied via the `/spaces?sdk=` page (the internal `/api/spaces` list API ignores the `sdk` query param — verified); the same page provides `title`/`description`/`lastModified`/`author`/`likes`. `search`/`author` go through the internal `/api/spaces?search=&author=` list API, which provides `sdk`/`likes`/`createdAt`/`tags`/`trendingScore` (and is used to enrich the sdk page results). No login required.

**Field availability by path:**

- **sdk set, author unset** (hybrid, deterministic): the command reads the `/spaces?sdk=X[&search=Y]` pages as the base and enriches from the API top-100 where ids overlap. Every returned item always has `title`, `description`, `lastModified`, `author`, `likes`, `id`, `url`, `sdk`. `createdAt`/`tags`/`trendingScore` are filled only for spaces that also appear in the `/api/spaces` top-100; spaces outside the top-100 (e.g. most streamlit spaces) have these three as `null`. The field set no longer depends on the limit value.
- **no sdk, or author set** (API only): results come from `/api/spaces`; `sdk`/`likes`/`createdAt`/`tags`/`trendingScore` are filled, while `title`/`description`/`lastModified` are always `null` (the list API does not expose them).

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `sdk` | string (enum) | no | - (all) | SDK type filter: `gradio`(Gradio 界面) / `streamlit`(Streamlit 界面) / `static`(静态页面) / `docker`(Docker 容器). |
| `search` | string | no | - | Keyword search within Spaces (matches the /spaces page search box, URL `?search=`). |
| `author` | string | no | - | List all Spaces by one author/organization (e.g. `HuggingFaceFW`). |
| `limit` | integer | no | 20 | Maximum Spaces to return (a plain positive integer, 1-100). Non-integer strings such as `1.5`/`1e3`/`2abc` are rejected with `INVALID_PARAM`. |

## Return Value

```json
{
  "items": [{
    "id": "mecxlan/Fyp_MriBraTS",
    "url": "https://huggingface.co/spaces/mecxlan/Fyp_MriBraTS",
    "likes": 2,
    "sdk": "streamlit",
    "author": "mecxlan",
    "createdAt": null,
    "tags": [],
    "trendingScore": null,
    "lastModified": "2026-08-03T15:19:59",
    "description": "UNET BraTS, EDA, and Data Visualization.",
    "title": "MRI_BraTS_AU_ICRTDS_App"
  }],
  "count": 1,
  "filters": { "sdk": "streamlit", "search": null, "author": null }
}
```

Notes:
- Multiple data paths, all returning the same key set:
  - **no sdk, or author set** (API path): uses the internal `/api/spaces?search=&author=` list API — fills `sdk`, `likes`, `createdAt`, `tags`, `trendingScore`; `lastModified`/`description`/`title` are `null`. When `author` is combined with `sdk`, the `sdk` filter is applied client-side on the author-narrowed result (the API ignores the `sdk` query param but every item carries its `sdk` field).
  - **sdk without author** (hybrid): always reads the `/spaces?sdk=` SSR pages (the only source that filters by sdk) as the base, so `title`/`description`/`lastModified`/`author`/`likes` are always present, and enriches from the API top-100 where ids overlap (fills `createdAt`/`tags`/`trendingScore` for spaces in the top-100). Previously a "fast path" skipped the pages when the API top-100 post-filter alone provided enough items (e.g. gradio up to 72), which silently returned `null` title/description/lastModified; that behavior is removed so the field set is stable regardless of the limit.
- `url` is derived from `id`; `author` is derived from the `org/` prefix of `id` on the API path, or from the card footer on the page path.
- `limit` > 24 on the sdk path is honored by paginating `/spaces?sdk=X&p=N` (24 cards/page, verified), fetched concurrently; the number of pages fetched is `ceil(limit/24)`.
- When `sdk`+`search` is used, the returned page cards are additionally filtered client-side against the search string, so the combination only returns matching spaces even if the SSR page ignores `?search=`.
- If the sdk page source fails (HTTP 429/5xx/network) but the API top-100 already provides enough items, the command degrades to the API-only result (title/description/lastModified `null`) instead of failing.
- `models` is intentionally not in the list output (the list API and SSR cards do not expose it); use `huggingface/get-space` for full per-Space metadata including linked models.

## Usage

```
websculpt huggingface list-spaces
websculpt huggingface list-spaces --sdk streamlit
websculpt huggingface list-spaces --sdk gradio --search llama --limit 10
websculpt huggingface list-spaces --author HuggingFaceFW --limit 20
websculpt huggingface list-spaces --author HuggingFaceFW --sdk static
websculpt huggingface list-spaces --sdk docker --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — invalid `sdk` (not one of gradio/streamlit/static/docker), or `limit` not a plain positive integer between 1 and 100. Also raised if HF rejects an sdk value with an HTTP 400 page.
- `EMPTY_RESULT` — no Spaces match the given filters.
- `RATE_LIMITED` — the `/spaces?sdk=` page source returned HTTP 429 and the API top-100 did not already provide enough items.
- `NETWORK_ERROR` — the list API returned non-200/unparseable, or the `/spaces?sdk=` page source returned HTTP 5xx/403 or a network failure and the API top-100 did not already provide enough items.
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging is connected (produced by the daemon).
- `COMMAND_TIMEOUT` — command exceeded the 20-minute execution timeout (produced by the daemon).
