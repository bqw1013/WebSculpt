# arxiv/list-papers

## Description

List papers in an arXiv category — the same listings as the category pages' **new** / **recent** views and **monthly archives** (`arxiv.org/list/{category}/new` etc.).

- **period=new** (default): today's listing in three sections — **New submissions** / **Cross submissions** / **Replacement submissions** — each with inline abstracts.
- **period=recent**: the past week's submissions, grouped by day (title-only cards, no abstracts).
- **period=month**: a monthly archive of papers **submitted** in that month, newest first (Atom API source; includes precise submission timestamps and abstracts).

No authentication required. Each invocation performs a **single request** (no internal pagination). arXiv's ≥3s consecutive-request etiquette is respected at the caller level — when scripting repeated calls, space them out.

## Parameters

| Param | Required | Default | Meaning |
|---|---|---|---|
| `--category` | yes | - | arXiv category ID, e.g. `cs.AI`, `cs.LG`, `astro-ph.CO`, `hep-th`. **Case-sensitive**: archive part lowercase, subcategory suffix uppercase (`cs.ai` is invalid). ~155 valid values; enumerate with `arxiv/list-categories`. |
| `--period` | no | `new` | Listing type: `new` (today's new/cross/replacement submissions, three sections, inline abstracts) / `recent` (past week, grouped by day, title-only) / `month` (monthly archive, newest first, set `--month`). |
| `--month` | no | previous month | Archive month `YYYY-MM` (e.g. `2026-07`). Only used when `period=month`. |
| `--limit` | no | `50` | Max papers to return, 1–200. For `period=new` the limit applies **per section**. Returns `partial=true` when a listing is exhausted. |

## Return Value

Each `Paper` card:

```json
{
  "id": "2608.12325",
  "title": "Position: Reasoning is a Learnable Rule-Based Process",
  "authors": ["Rachel Lawrence", "Jacqueline Maasch"],
  "categories": ["cs.AI", "cs.CL", "cs.LG"],
  "publishedAt": "2026-08-14",
  "abstract": "Autonomous reasoning is among the most ...",
  "url": "https://arxiv.org/abs/2608.12325",
  "pdfUrl": "https://arxiv.org/pdf/2608.12325"
}
```

- `publishedAt` granularity follows the source: `YYYY-MM-DD` (day-level) for `new`/`recent` listings; a full ISO timestamp `YYYY-MM-DDTHH:mm:ssZ` (original submission time) for `month`.
- `abstract` is present for `new` (inline on the page) and `month` (from the Atom API); absent for `recent` (the page is a title-only listing).
- `partial=true` means the listing was exhausted before the requested limit was reached.

Per-period shapes:

| period | shape |
|---|---|
| `new` | `{ date, new: Paper[], cross: Paper[], replacements: Paper[], partial }` |
| `recent` | `{ papers: Paper[], partial }` |
| `month` | `{ papers: Paper[], partial }` |

## Usage

```bash
# Today's new/cross/replacement submissions in cs.AI (default period=new)
websculpt arxiv list-papers --category cs.AI

# Past week for cs.LG, first 5 papers
websculpt arxiv list-papers --category cs.LG --period recent --limit 5

# July 2026 archive for cs.AI, newest first, first 20
websculpt arxiv list-papers --category cs.AI --period month --month 2026-07 --limit 20

# Monthly archive, default previous month
websculpt arxiv list-papers --category hep-th --period month --limit 10
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `MISSING_PARAM` | `--category` was not provided or empty. |
| `INVALID_CATEGORY` | Category format is wrong / case-sensitive violation, or arXiv returned HTTP 400 (invalid archive or category). |
| `INVALID_PERIOD` | `--period` is not one of `new` / `recent` / `month`. |
| `INVALID_MONTH` | `--month` is not `YYYY-MM`. |
| `INVALID_LIMIT` | `--limit` is not an integer in 1–200. |
| `NOT_FOUND` | arXiv returned 404. |
| `HTTP_ERROR` | arXiv returned a non-200/400/404 HTTP status or the request failed. |
| `DRIFT_DETECTED` | The listing page structure changed (expected markers not found). |
