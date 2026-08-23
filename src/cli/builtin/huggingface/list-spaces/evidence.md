# Evidence: huggingface/list-spaces

This document records the research and validation evidence for the `huggingface/list-spaces` command.

## Exploration Path

Command library overlap check: `huggingface/get-trending` (browser, reads `article` cards on `/models|/datasets|/spaces`, params type/sort/limit) and `huggingface/get-papers` exist; neither covers Space listing with sdk/search/author filters. No name conflict.

Explored in a prior explore workspace (assess passed). Explore used Playwright CLI attached to the user's Chrome via `chrome://inspect` remote debugging; session `<session>`. Polite pacing: every HF operation used random scroll + real mouse move + random wait; no 429/403/CAPTCHA observed.

Additional design verification during capture (session `<session>`): the `/spaces?sdk={sdk}` page renders a fixed 24 article cards and does NOT load more on scroll, but supports URL pagination `?p=N` (`/spaces?sdk=streamlit&p=2` returns a different 24-card set). The same paginated page can be fetched same-origin via `fetch('/spaces?sdk=X&p=N')` + `DOMParser` to extract cards without full page navigations.

## Verified URLs

- `https://huggingface.co/spaces` (list page, SSR, baseline first card `multimodalart/minimax-h3`)
- `https://huggingface.co/spaces?sdk=gradio` (sdk filter works)
- `https://huggingface.co/spaces?sdk=streamlit` (sdk filter works; 24 cards, pagination `?p=0/1/2` verified)
- `https://huggingface.co/spaces?sdk=static` (sdk filter works)
- `https://huggingface.co/spaces?sdk=docker` (docker is a valid sdk value)
- `https://huggingface.co/spaces?sdk=foobar` (400 error page, title "400 – Hugging Face")
- `https://huggingface.co/spaces?search=llama` (page search works)
- `https://huggingface.co/spaces?sdk=gradio&search=llama` (page sdk+search combine works)
- `https://huggingface.co/spaces?author=<hf-user>` (page IGNORES author param, returns default trending)
- In-page API (all HTTP 200):
  - `/api/spaces?limit=3|5|10|100` (limit 1-100 works)
  - `/api/spaces?sdk=gradio|streamlit|static&limit=3` (sdk param IGNORED by API)
  - `/api/spaces?filter=gradio|library=gradio|tag=gradio|library_name=gradio` (all ignored)
  - `/api/spaces?search=llama&limit=3` (search works)
  - `/api/spaces?author=<hf-user>&limit=3|100` (author works; returns all of the author's spaces)
- `fetch('/spaces?sdk=streamlit&p=2')` returns SSR HTML (200, ~289KB) parseable to 24 cards.

## Structural Evidence

API list endpoint `/api/spaces?search=&author=&limit=` (browser fetch). Item shape (verified):
```json
{
  "_id": "6a5ccd9920d4f7e0a3f4a01a",
  "id": "cinderholm/wan2-2-i2v-v3",
  "likes": 732,
  "trendingScore": 293,
  "private": false,
  "sdk": "gradio",
  "tags": ["gradio", "mcp-server", "region:us"],
  "createdAt": "2026-07-19T13:14:01.000Z"
}
```
Keys: `_id, id, likes, trendingScore, private, sdk, tags, createdAt`. No `author` (derive from `id` part before first `/`), no `models`/`lastModified` (detail API only). `sdk` query param and `filter`/`library`/`tag`/`library_name` variants are all ignored. `search` and `author` query params work. Top-100 sdk distribution: gradio 72 / static 17 / docker 11 / streamlit 0 (streamlit requires the page path).

SSR card structure on `/spaces` page (page path, sdk filter):
- Container: `article` elements; each has `a[href^="/spaces/"]` (repo link), `h4` (display title), header heart-count `span` (likes), `footer button` (author), `footer time[datetime]` (lastModified), `main p` (description).
- Must filter hrefs to `/^\/spaces\/[^/]+\/[^/]+$/` to exclude `/spaces/launch` (New Space button) and other non-card links.
- Page renders exactly 24 cards; pagination via `?p=N` (N from 0); verified `?p=1` and `?p=2` return distinct sets. `fetch` of the paginated URL returns SSR HTML parseable with `DOMParser`.

Sample cards from `/spaces?sdk=streamlit`:
- `mecxlan/Fyp_MriBraTS` | likes 2 | author mecxlan | lastModified 2026-08-03T15:19:59 | "UNET BraTS, EDA, and Data Visualization." | title "MRI_BraTS_AU_ICRTDS_App"
- `polymathic-ai/TheWell` | likes 32 | lastModified 2024-12-03T16:51:37 | "Visualization of data from the Well"
- `gimbx/Uncensored-HackerCoding-GPT` | likes 322 | lastModified 2025-01-10T19:34:12

## Failure Signals

- Invalid sdk on the page path: `/spaces?sdk=foobar` returns HTTP 400 page (title starts "400") — detect `document.title` starting with "400" and throw `INVALID_PARAM`.
- API `sdk` param silently ignored — must NOT rely on it; use page sdk filter or client-side post-filter (author-narrowed API results only).
- Page card selector drift: if zero `article` cards with a space href are found on the sdk path, throw `EMPTY_RESULT` (or `DRIFT_DETECTED` if sdk is a known-good value but structure changed).
- Page `?author=` param ignored — author must go through the API path.
- Empty result: no items after filters → `EMPTY_RESULT`.
- Network/fetch failure → `NETWORK_ERROR`.
- Invalid/non-numeric/out-of-range `limit` (1-100) → `INVALID_PARAM`.
- Streamlit spaces absent from API top-100: enrichment via `/api/spaces?limit=100` will not cover streamlit ids; card-only fields are expected for those.

## Capture Assessment

This command should be captured. HF Space listing is a frequent data path with no existing command coverage for sdk/search/author filtering. The path is fully verified (page sdk filter, API search/author, pagination, card structure, failure signals). It is parameterizable and reusable as `huggingface/list-spaces`, browser runtime, no login required.
