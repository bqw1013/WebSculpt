# huggingface/list-papers

List trending AI research papers from Hugging Face Papers by period (daily / weekly / monthly). Replaces the old `get-papers` command with a stable SSR hydration-JSON extraction path.

## Description

Navigates to Hugging Face Papers, switches to the requested period tab (daily 每日 / weekly 每周 / monthly 每月), and reads the SSR hydration JSON (`<div data-target="DailyPapers" data-props="...">`) to return ranked papers with title, url, abstract, authors, publication date, upvotes, GitHub repo + stars (when present), arXiv link, organization, comment count, and submitter. The `url` / `arxiv` fields chain directly into the `huggingface/get-paper` detail command.

The `/papers` redirect target is state-dependent (remembers the last-viewed period), so the command always verifies the landing period and clicks the requested period tab when needed — it does not construct date URLs.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `period` | no | `daily` | Trending period. All values: `daily`（每日）/ `weekly`（每周）/ `monthly`（每月）. Invalid values return `INVALID_PARAM`. |
| `limit` | no | `20` | Maximum papers to return (integer 1-100). Daily lists have at most 30 papers; when `limit` exceeds the available count, the actual returned count is reported. |

## Return Value

```json
{
  "papers": [
    {
      "rank": 1,
      "title": "论文标题",
      "url": "https://huggingface.co/papers/{arxivId}",
      "abstract": "摘要全文",
      "authors": ["作者1", "作者2"],
      "published": "2026-08-06T00:00:00.000Z",
      "upvotes": 84,
      "github": { "url": "https://github.com/org/repo", "stars": 18 },
      "arxiv": "https://arxiv.org/abs/{arxivId}",
      "organization": "机构名|null",
      "comments": 2,
      "submittedBy": "HF 提交人"
    }
  ],
  "count": 30,
  "period": "daily"
}
```

- `github` is `null` when the paper has no GitHub repository; `github.stars` is `null` if star count is unknown.
- `organization` may be `null` for papers without an affiliated institution.
- `count` is the number of papers actually returned (min of `limit` and the period's available papers).

## Usage

```
websculpt huggingface list-papers
websculpt huggingface list-papers --period weekly
websculpt huggingface list-papers --period monthly --limit 50
websculpt huggingface list-papers --limit 1
```

## Common Error Codes

- `INVALID_PARAM` — `period` not in daily/weekly/monthly, or `limit` not an integer in [1, 100].
- `EMPTY_RESULT` — no papers found on the page (period has no papers).
- `DRIFT_DETECTED` — the period tab button or the `[data-target="DailyPapers"]` hydration element could not be found (page structure changed).
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging connected (infrastructure error).
