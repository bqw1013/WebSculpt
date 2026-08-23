# arxiv/get-author-papers

List papers by an author's name from arXiv — equivalent to clicking an author's name on any abstract page. arXiv has no author profile pages; the author link on an abstract page is an author search, and this command is a friendlier wrapper around that search.

## Description

Accepts a natural author name and returns that author's papers, newest first. Internally it converts the name to an arXiv `au:` query and calls the official Atom API (`export.arxiv.org/api/query`).

**Conversion logic (important):** the command takes the **family name = last token** of the input and queries `au:{FamilyName}`:
- `Yann LeCun` → `au:LeCun`
- `LeCun` (single token) → `au:LeCun`
- `LeCun, Yann` (comma form) → `au:LeCun`
- `Laurens van der Maaten` → `au:Maaten` (multi-word family names are approximated by their last token; measured recall ≈ the quoted full phrase `au:"van der Maaten"`, 56 vs 55 hits)

The formal arXiv "Last, F" abbreviation (e.g. `Ioffe, S`) is intentionally **not** used: the Atom API does exact-phrase matching, and `au:"LeCun, Y"` returns only 1 hit whereas `au:LeCun` returns 227. The web search page leniently accepts "Last, F", but this command uses the API for cleaner structured output.

**Same-name limitation (inherent to arXiv):** arXiv does not disambiguate authors. Searching a common surname (e.g. `Wang`) can match tens of thousands of papers by different people. Use `--category` to narrow down. For a distinctive name like `Yann LeCun` (227 hits) the results are effectively all that author's work, including old papers where the name appears as initials (`Y. LeCun`).

## Parameters

| Parameter  | Required | Default | Description |
|------------|----------|---------|-------------|
| `--author` | yes      | —       | Author name in natural form: `"Yann LeCun"`, `"LeCun"`, or comma form `"LeCun, Yann"`. Names with letters in any script, spaces, apostrophes (`O'Brien`), hyphens (`Jean-Jacques`), periods, and commas are accepted. |
| `--category` | no     | —       | Restrict to one arXiv category, e.g. `cs.CV`, to reduce namesake noise. Case-sensitive: subcategory suffix is uppercase (`cs.AI`, not `cs.ai`). Enumerate all ~176 values with `arxiv/list-categories`. |
| `--limit`   | no       | 50      | Maximum number of papers to return, 1-200. |

## Return Value

```json
{
  "query": "au:LeCun",
  "totalResults": 227,
  "count": 50,
  "partial": false,
  "papers": [
    {
      "id": "2608.02208",
      "title": "Self-supervised DXA representations encode multi-system disease risk, ...",
      "authors": ["Gil Sasson", "...", "Yann LeCun"],
      "abstract": "...",
      "categories": ["cs.CV", "q-bio.QM"],
      "publishedAt": "2026-08-03T13:33:04Z",
      "url": "https://arxiv.org/abs/2608.02208",
      "pdfUrl": "https://arxiv.org/pdf/2608.02208"
    }
  ]
}
```

- `query` — the effective `search_query` sent to the API (includes `AND cat:{category}` when `--category` is given).
- `totalResults` — arXiv's total match count for that query (may exceed `count`).
- `count` — number of papers returned (== `papers.length`).
- `partial` — `true` when arXiv has fewer matches than the requested `limit` (the stream is exhausted); `false` when the request was filled. A no-match author returns `{ papers: [], count: 0, totalResults: 0, partial: true }` — not an error.
- `papers` — paper cards, newest submission first (`sortBy=submittedDate` descending). `id` is the arXiv ID without a version suffix; `categories` lists primary + cross-listed categories; `url`/`pdfUrl` are the abs and PDF links.

## Usage

```
websculpt arxiv get-author-papers --author "Yann LeCun"
websculpt arxiv get-author-papers --author "Yann LeCun" --limit 5
websculpt arxiv get-author-papers --author "LeCun, Yann" --category cs.CV
websculpt arxiv get-author-papers --author "Laurens van der Maaten" --limit 200
```

The command issues **one API request** for the whole limit (the API returns up to `max_results=200` in a single call). It only pauses between requests if a defensive re-query is ever needed, per arXiv's ≥3s request etiquette.

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | `--author` missing or empty. |
| `INVALID_PARAM` | `author` contains unsupported characters, or `limit` is not an integer in 1-200 (raw string validated first — no truncation). |
| `NETWORK_ERROR` | Could not reach the arXiv API (DNS/connection/timeout) — retry later. |
| `API_ERROR` | arXiv API returned a non-200 HTTP status (API-side failure). |

Empty results are not an error: a valid query with no matching papers returns an empty `papers` array with `partial: true`.
