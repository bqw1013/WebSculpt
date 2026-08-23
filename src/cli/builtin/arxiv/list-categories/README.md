# arxiv/list-categories

List arXiv's category taxonomy (155 categories as of 2026-08) — the valid values for the `--category` parameter of `arxiv/list-papers`, `arxiv/search`, and `arxiv/get-author-papers`.

## Description

Enumerates every arXiv category from the official static taxonomy page `https://arxiv.org/category_taxonomy` (a single GET request). Each entry is an `{id, name, group}` triplet:

- `id` — the category id that feeds directly into `--category` (e.g. `cs.AI`, `astro-ph.CO`, `hep-th`, `quant-ph`)
- `name` — the English full name (e.g. `Artificial Intelligence`)
- `group` — the top-level subject area the category belongs to (one of 8: `cs`, `econ`, `eess`, `math`, `physics`, `q-bio`, `q-fin`, `stat`)

Note: the group is the explicit taxonomy group, not an id prefix — the physics group contains many non-`physics`-prefixed ids (`astro-ph.*`, `cond-mat.*`, `gr-qc`, `hep-*`, `math-ph`, `nlin.*`, `nucl-*`, `quant-ph`).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group` | string | no | Top-level subject area to filter by. Valid values (all 8): `cs` (Computer Science), `econ` (Economics), `eess` (Electrical Engineering and Systems Science), `math` (Mathematics), `physics` (Physics), `q-bio` (Quantitative Biology), `q-fin` (Quantitative Finance), `stat` (Statistics). Omit to list all 155 categories. |

## Return Value

`Array<{id: string, name: string, group: string}>` — all (or the filtered) categories in page order. The list is complete in one response; there is no pagination.

## Usage

```
websculpt arxiv list-categories                 # list all 155 categories
websculpt arxiv list-categories --group cs      # list the 40 Computer Science categories
websculpt arxiv list-categories --group physics # list the 51 Physics-group categories (includes astro-ph.*, hep-th, quant-ph, ...)
```

## Common Error Codes

- `HTTP_4xx` / `HTTP_5xx` — arXiv returned a non-200 status for the taxonomy page.
- `DRIFT_DETECTED` — the page structure changed and no categories could be parsed (expected anchor `<h4>id <span>(name)</span></h4>` inside `accordion-head-grp_*` blocks was not found).
- `INVALID_GROUP` — `--group` is not one of the 8 valid values; the message lists all valid values (self-healing).
