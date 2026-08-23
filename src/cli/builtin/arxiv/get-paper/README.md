# arxiv/get-paper

Fetch the full record of a single arXiv paper — everything shown on its abstract page (`https://arxiv.org/abs/{id}`): title, authors, abstract, primary and cross-list categories, submission and update dates, full version history, author comments, journal reference, DOI, and abs/PDF links.

## Description

This command retrieves the complete metadata record of one arXiv paper by its arXiv ID or a full abstract/PDF URL. It is the "detail" counterpart to the list/search commands: those return paper cards, while this returns the full record behind a single ID, suitable for reading an abstract carefully, checking version history and citation metadata (Comments / Journal reference / DOI), and getting the PDF link.

The full text of the paper lives in the PDF — use `arxiv/download-paper` for that.

## Parameters

| Name | Required | Description |
|------|----------|-------------|
| `id` | yes | arXiv paper ID or URL. Accepts a new-style ID (`2601.00001`), a new-style ID with a version suffix (`2601.00001v2`), an old-style ID (`hep-th/9901001`, optionally `hep-th/9901001v3`), or a full abstract/PDF URL (`https://arxiv.org/abs/1706.03762`, `https://arxiv.org/pdf/1706.03762v2`). IDs appear in the results of `arxiv/list-papers`, `arxiv/search`, and `arxiv/get-author-papers`. |

## Return Value

```json
{
  "id": "1706.03762",
  "version": "v7",
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "Noam Shazeer", "..."],
  "abstract": "The dominant sequence transduction models ...",
  "categories": { "primary": "cs.CL", "all": ["cs.CL", "cs.LG"] },
  "publishedAt": "2017-06-12T17:57:34Z",
  "updatedAt": "2023-08-02T00:41:18Z",
  "versions": [
    { "version": "v1", "date": "2017-06-12T17:57:34Z" },
    { "version": "v7", "date": "2023-08-02T00:41:18Z" }
  ],
  "comment": "15 pages, 5 figures",
  "journalRef": null,
  "doi": "10.48550/arXiv.1706.03762",
  "url": "https://arxiv.org/abs/1706.03762",
  "pdfUrl": "https://arxiv.org/pdf/1706.03762"
}
```

Field notes:

- `id` — canonical arXiv ID, always unversioned (e.g. `1706.03762`, `hep-th/9901001`).
- `version` — the requested version if the input carried a `vN` suffix (e.g. `1706.03762v2` → `v2`); otherwise the latest version (last entry of `versions`).
- `authors` — author names in natural order (e.g. `Ashish Vaswani`), as shown on the abstract page. Collaboration papers render a single name like `The ATLAS Collaboration`.
- `categories.primary` — the primary subject category code (e.g. `cs.CL`); `categories.all` — primary plus every cross-list category code.
- `publishedAt` — first version (v1) submission time, ISO 8601 UTC.
- `updatedAt` — latest revision time, ISO 8601 UTC.
- `versions` — complete version history as `[{ version, date }]`, oldest first, each date ISO 8601 UTC. This is the only place the full history is available (the meta tags do not carry it).
- `comment` — the author-supplied Comments string (e.g. `15 pages, 5 figures`), or `null` when absent.
- `journalRef` — the Journal reference string (e.g. `Prog.Theor.Phys.101:1155-1164,1999`), or `null` when absent.
- `doi` — the journal DOI when the paper has one (from the page's `citation_doi` meta, e.g. `10.1143/PTP.101.1155`); otherwise the arXiv-issued DataCite DOI `10.48550/arXiv.{id}`, which every paper has.
- `url` / `pdfUrl` — abs and PDF links. When a specific version was requested they carry the version suffix (`.../abs/1706.03762v2`, `.../pdf/1706.03762v2`); otherwise they are unversioned (resolve to the latest version).

## Usage

```
websculpt arxiv get-paper --id 2601.00001
websculpt arxiv get-paper --id 2601.00001v2
websculpt arxiv get-paper --id hep-th/9901001
websculpt arxiv get-paper --id https://arxiv.org/abs/1706.03762
websculpt arxiv get-paper --id https://arxiv.org/pdf/1706.03762v2
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | The required `id` parameter was not provided. |
| `NOT_FOUND` | The arXiv ID or version does not exist (HTTP 404). |
| `DRIFT_DETECTED` | The abstract page structure changed; expected meta tags / version history were not found. |
| `REQUEST_FAILED` | Network failure or a non-200/404 HTTP response. |

## Notes

- One HTTP request per invocation (the abstract page) — naturally compliant with arXiv's request etiquette (>=3s between requests).
- No login, no browser required.
