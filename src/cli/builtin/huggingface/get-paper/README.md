# huggingface/get-paper

Fetch a single Hugging Face paper's full detail by its arXiv id.

## Description

Given a paper arXiv id (e.g. `2608.05987`, from the `https://huggingface.co/papers/2608.05987` URL or the `url` field of `list-papers` output), returns the paper title, abstract, authors, submitter, upvotes, comment count, publication date, and arXiv link. Complements the list command `huggingface/list-papers`: chain `list-papers` → `get-paper`.

## Parameters

- `paper_id` (string, required): Paper id (arXiv number), e.g. `2608.05987`. Taken from the URL `https://huggingface.co/papers/2608.05987`, or extracted from the `url` field in `list-papers` output (last path segment). 论文编号，取自 `/papers/{id}` URL 或 `list-papers` 的 `url` 字段提取。

## Return Value

```json
{
  "id": "2608.05987",
  "title": "AgentOPSD: Recursive Self-Distillation for Agentic Reinforcement Learning",
  "url": "https://huggingface.co/papers/2608.05987",
  "abstract": "string",
  "authors": ["string"],
  "submitted_by": "string | null",
  "upvotes": 84,
  "comments_count": 2,
  "published": "2026-08-06T00:00:00.000Z",
  "arxiv_url": "https://arxiv.org/abs/2608.05987"
}
```

Field notes:
- `abstract` = API `summary` field (full abstract text).
- `submitted_by` = display name of the daily-papers submitter; `null` when the paper has no submitter.
- `comments_count` = number of rendered comments in the paper Community section (counted from the SSR DOM; not present in the API).
- `published` = ISO date string.
- `url` / `arxiv_url` are constructed from the `paper_id`.

## Usage

```
websculpt huggingface get-paper --paper_id 2608.05987
```

## Common Error Codes

- `INVALID_PARAM`: `paper_id` is empty or not an arXiv id format like `2608.05987` (`^\d{4}\.\d{4,5}$`).
- `NOT_FOUND`: the arXiv id is well-formed but the paper does not exist on Hugging Face (API 404 or page redirect to `/papers/index?arxivId=...`).
- `NETWORK_ERROR`: the in-page API fetch failed.
- `DRIFT_DETECTED`: page/API structure changed (missing title or unexpected API status).
- `BROWSER_ATTACH_REQUIRED`: browser with remote debugging is not connected.
