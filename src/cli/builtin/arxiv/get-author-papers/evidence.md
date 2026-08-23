# Evidence: arxiv/get-author-papers

This document records the research and validation evidence for the `arxiv/get-author-papers` command.

## Exploration Path

Command library check (`websculpt command list arxiv`): only `arxiv/search-papers` (builtin, keyword/boolean search) exists. No author-dimension command — no reuse candidate, new path explored.

Explored the official arXiv Atom API `https://export.arxiv.org/api/query` directly via node `fetch`, following arXiv's API etiquette (≥3s between requests during exploration). No browser automation required. Node runtime contract (`node-contract.md`) read before implementing `draft/command.js`.

## Verified URLs

- `https://export.arxiv.org/api/query` — official Atom API; primary data source (author search, pagination via `start`/`max_results`, sorting via `sortBy`/`sortOrder`, category filter via `cat:`).
- `https://arxiv.org/abs/1502.03167` — verified the abs-page author-link format is `https://arxiv.org/search/cs?searchtype=author&query=Ioffe,+S` ("Last, F"), which the web backend leniently interprets; the Atom API does NOT accept this format (see Structural Evidence).
- `https://arxiv.org/search/?searchtype=author&query=LeCun` — web author-search page (verified recall parity, HTML card structure `arxiv-result`; not used as the data source because the API is cleaner).

## Structural Evidence

Atom API response is XML with `opensearch:totalResults` and one `<entry>` per paper. Entry fields (verified on a live entry):

- `<id>` = `http://arxiv.org/abs/2608.02208v1` (strip prefix and `v\d+` suffix → paper id `2608.02208`)
- `<title>`, `<summary>` (abstract), `<published>` ISO timestamp
- `<category term="..."/>` repeated (primary + cross-list; order not guaranteed)
- `<author><name>Full Name</name></author>` repeated (natural order, e.g. "Yann LeCun")
- abs URL `https://arxiv.org/abs/{id}` and pdf URL `https://arxiv.org/pdf/{id}`

Author query format findings (measured `totalResults`):

| Query | total | Note |
|---|---|---|
| `au:"LeCun, Y"` | 1 | formal "Last, F" abbreviation FAILS on the API (exact-phrase match) |
| `au:LeCun` | 227 | family name, case-insensitive (`au:lecun` same), best recall |
| `au:"LeCun, Yann"` / `au:"Yann LeCun"` | 226 | full-name phrase misses 1 initials-variant paper ("Y. LeCun") |
| `au:LeCun AND au:Yann` | 226 | family∩given intersection, same as full name |
| `au:"van der Maaten"` | 55 | multi-word family name works quoted |
| `au:Maaten` | 56 | last-token approximation ≈ quoted (55 + 1 possible namesake) |
| `au:lec` | 0 | `au:` is whole-word exact (case-insensitive), NOT prefix/substring |
| `au:Wang` | 184389 | common-surname namesake noise is severe (inherent, no disambiguation) |
| `au:"Wang, Wei"` / `au:"Wei Wang"` | 2558 | exact full name still ambiguous |
| `au:Wang AND au:Wei` | 15906 | intersection better but still large |

Sorting: `au:` defaults to relevance; explicit `sortBy=submittedDate&sortOrder=descending` returns newest first (verified: 2026-08-03 → descending).

Pagination/capacity: `max_results=200` returns 200 entries (total 227); `max_results=500` caps at 227. `start=50` returns the next batch (no overlap). Zero-result query (`au:Xyzzyqwerty`) returns HTTP 200 with `totalResults=0` and no entries (not an error).

Category narrowing: `au:LeCun AND cat:cs.CV` → 114; `au:LeCun AND cat:cs.LG` → 148. `cat:` matches primary OR cross-listed categories (verified: a paper with primary cs.LG appears in a `cat:cs.CV` query).

Conversion decision: input "Yann LeCun" → family name = last whitespace token → `au:LeCun`. Comma input "LeCun, Yann" → part before comma → `au:LeCun`. This is NOT the plan's "Last, F" abbreviation (fails on the API); deviation recorded in explore trace.

## Failure Signals

- HTTP non-200 from the API → `API_ERROR` (e.g., network failure or arXiv-side error).
- Empty/whitespace `author` → `MISSING_PARAM`.
- Author containing unsupported characters (regex `^[\p{L}\p{M}'\-\.,\s]+$` fails) or empty family name after extraction → `INVALID_PARAM`.
- `limit` not a pure integer string (`/^\d+$/` fails) or outside 1-200 → `INVALID_PARAM` (no parseInt truncation: validate raw string first).
- Zero results is a VALID empty output: return `{ papers: [], count: 0, totalResults: 0, partial: true }`, do NOT throw.
- Drift risk: Atom XML tag structure change (missing `<opensearch:totalResults>` → totalResults=0; missing `<entry>` → empty list). Parsing uses the same regex patterns as the proven builtin `arxiv/search-papers`.
- Rate limit: arXiv API etiquette requires ≥3s between requests; the command issues a single request for the whole limit (≤200) so no in-command pause is normally needed. A defensive pagination loop (with 3s + jitter sleep) exists in case the API ever returns fewer than requested while `totalResults` shows more.

## Capture Assessment

This path should be captured as `arxiv/get-author-papers`: author-name paper listing is a high-frequency scholarly need, the natural-name → arXiv query conversion (family-name, not "Last, F") is non-obvious and error-prone, and the same-name limitation requires explicit documentation. The path is fully verified end-to-end with real data (happy path, category narrowing, comma form, multi-word names, zero results, common-surname noise). Public API, no auth, no browser → cheap and reliable `node` command. It is part of the planned arXiv command family and shares the Paper record shape with `arxiv/list-papers` / `arxiv/search`.
