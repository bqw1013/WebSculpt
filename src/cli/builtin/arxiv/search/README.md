# arxiv/search

Search arXiv papers by keyword — the CLI equivalent of the search box and advanced search form on arxiv.org. Backed by the official public Atom API (`export.arxiv.org/api/query`). No login and no browser required.

## Description

`websculpt arxiv search` builds an arXiv `search_query` from convenient parameters and returns the total hit count plus paper cards. Plain keywords search the field chosen by `--field` with AND semantics (all words must match); queries written in native arXiv syntax (field prefixes, `AND`/`OR`/`ANDNOT`, quoted phrases) are passed through to the API verbatim.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--query` | yes | - | Search keywords (e.g. "vision transformer") or native arXiv syntax (e.g. `ti:transformer AND au:vaswani`). A plain multi-word query matches ALL words (AND) within the field chosen by `--field`. Native syntax (contains a field prefix like `ti:`/`au:`/`abs:`/`all:` or a boolean `AND`/`OR`/`ANDNOT` or a quoted phrase) is passed through verbatim and `--field` is ignored. Use quotes for exact phrases, e.g. `all:"vision transformer"`. |
| `--field` | no | `all` | Which field the plain keywords match — **all 8 values**: `all` = 全部字段 (all fields) / `title` = 标题 / `author` = 作者 / `abstract` = 摘要 / `comments` = 作者评论 / `journal_ref` = 期刊引用 / `doi` = DOI / `paper_id` = 论文ID. Mirrors the advanced search form's field dropdown. Ignored for native-syntax queries. |
| `--category` | no | - | Restrict results to one arXiv category, e.g. `cs.AI`, `cs.CV`, `hep-th`. Case-sensitive (subcategory suffix is uppercase: `cs.AI` not `cs.ai`). ~176 valid values — run `arxiv/list-categories` to enumerate, or copy from any category page URL (`arxiv.org/list/{category}/new`). |
| `--date_from` | no | - | Submission-date range start, format `YYYY-MM-DD` (e.g. `2026-01-01`). May be used alone (lower bound only) or with `--date_to`. |
| `--date_to` | no | - | Submission-date range end, format `YYYY-MM-DD` (e.g. `2026-03-31`). May be used alone (upper bound only) or with `--date_from`. |
| `--sort_by` | no | `submitted_date` | Result ordering — **all 3 values**: `relevance` = 相关度 (best match) / `submitted_date` = 最新提交优先 (newest submissions first) / `last_updated` = 最近修订优先 (most recently revised first). |
| `--limit` | no | `50` | Maximum number of results (1-200). A single API request fetches the full limit; `partial=true` when fewer results exist than requested. |

## Return Value

```jsonc
{
  "totalResults": 30431,           // total hit count (opensearch:totalResults)
  "papers": [
    {
      "id": "2608.13560",          // arXiv ID, version suffix stripped
      "title": "...",
      "authors": ["..."],          // author names
      "abstract": "...",           // full abstract (may contain LaTeX escapes)
      "categories": ["cs.CV", "cs.AI"],  // all categories including the primary one
      "publishedAt": "2026-08-13T17:59:57Z", // ISO 8601 submission timestamp
      "url": "https://arxiv.org/abs/2608.13560",
      "pdfUrl": "https://arxiv.org/pdf/2608.13560"
    }
  ],
  "partial": false                 // true when fewer results exist than the requested limit
}
```

No matches returns `{ "totalResults": 0, "papers": [], "partial": false }` — a successful empty result, not an error.

## Usage

```bash
# Basic keyword search (AND across all fields), newest first
websculpt arxiv search --query "vision transformer"

# Restrict to a category
websculpt arxiv search --query "vision transformer" --category cs.CV

# Title-field search, relevance ordering
websculpt arxiv search --query "sparse attention" --field title --sort_by relevance

# Author search
websculpt arxiv search --query "Vaswani" --field author

# Submission-date range (either bound usable alone)
websculpt arxiv search --query "vision transformer" --date_from 2026-01-01 --date_to 2026-03-31
websculpt arxiv search --query "vision transformer" --date_from 2026-06-01

# Native arXiv syntax passes through verbatim
websculpt arxiv search --query "ti:transformer AND au:vaswani"
websculpt arxiv search --query 'all:"vision transformer"'

# Larger result set
websculpt arxiv search --query "retrieval augmented generation" --limit 200
```

The `id` field of each paper can be fed directly to `websculpt arxiv get-paper` for the full record, or to `websculpt arxiv download-paper` for the PDF.

## Common Error Codes

- `MISSING_PARAM` — `--query` is missing or empty.
- `INVALID_PARAM` — invalid `--field` / `--sort_by` value, non-integer or out-of-range `--limit`, or malformed `--date_from`/`--date_to` (expected `YYYY-MM-DD`). The error message lists the valid enum values.
- `API_ERROR` — the arXiv API returned a non-2xx status (e.g. HTTP 400 for a malformed native query) or the network request failed.
- An empty result is NOT an error: it returns `totalResults: 0` with an empty `papers` array.

## Prerequisites

None. The arXiv Atom API is fully public — no login, no API key, no browser. The command issues a single request for the requested `limit` (≤200); arXiv's ≥3-second spacing policy between consecutive requests is respected when pagination is ever needed.
