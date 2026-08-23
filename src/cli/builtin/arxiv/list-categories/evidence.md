# Evidence: arxiv/list-categories

This document records the research and validation evidence for the `arxiv/list-categories` command.

## Exploration Path

Explored in a prior explore workspace (explore assess passed 2026-08-14).

- Library check: `websculpt command list arxiv` shows only `arxiv/search-papers` (builtin, Atom API keyword search). No existing command enumerates arXiv categories. This command is new and complementary.
- The page `https://arxiv.org/category_taxonomy` was fetched with `curl -sL` (HTTP 200, 83,909 bytes, no redirect) and re-verified end-to-end with a `node` v22 script using global `fetch` + regex parsing (the same runtime the command uses). No browser automation used.
- Runtime contract read (node runtime, ESM default export, no third-party imports, serializable return).

## Verified URLs

- https://arxiv.org/category_taxonomy — HTTP 200, fetched 2026-08-14, static HTML containing all 155 categories inline (no JS rendering, no pagination, no login).

## Structural Evidence

Static HTML layout (verified from the actual response):

- All content lives inside `<div id="category_taxonomy_list" class="large-data-list">`.
- Each top-level subject is a group block delimited by `<h2 class="accordion-head" id="accordion-head-grp_{group}">`, where `{group}` is the group id. The group name text sits in a nested `<button>`.
- Immediately after each group `<h2>` is `<div class="accordion-body" id="accordion-panel-grp_{group}" ...>` containing that group's categories.
- Each category is `<h4>{id} <span>({name})</span></h4>` (id before the span, English name inside parentheses).
- The page also contains one column header `Category Name (Category ID)` in the guide section — must be excluded (matches the same h4 pattern but its inner `<span>` is absent).

Parsing rule used and verified:

- Group blocks: `/<h2 class="accordion-head" id="accordion-head-grp_([^"]+)">\s*<button[^>]*>(.*?)<\/button>\s*<\/h2>\s*<div class="accordion-body" id="[^"]+"[^>]*>(.*?)(?=<h2 class="accordion-head"|$)/gs`
- Category in each group body: `/<h4>([^<]+?)<span>\(([^)]*)\)<\/span><\/h4>/gs` → `{id, name, group}`.

Measured data (2026-08-14):

- 8 groups, 155 categories total: cs=40, econ=3, eess=4, math=32, physics=51, q-bio=10, q-fin=9, stat=6.
- Group filter must match the explicit `group` field, NOT an id prefix: the physics group's 51 categories include 29 ids that do not start with "physics" (astro-ph.CO/EP/GA/HE/IM/SR, cond-mat.*, gr-qc, hep-ex/lat/ph/th, math-ph, nlin.*, nucl-*, quant-ph).
- Sample verified rows:
  - `cs.AI / Artificial Intelligence / cs`
  - `cs.LG / Machine Learning / cs`
  - `astro-ph.CO / Cosmology and Nongalactic Astrophysics / physics`
  - `hep-th / High Energy Physics - Theory / physics`
  - `quant-ph / Quantum Physics / physics`
  - `physics.optics / Optics / physics`
- The official page currently lists 155 categories, not the ~176 figure in the old plan document.

## Failure Signals

- Non-200 HTTP: throw `[HTTP_{status}]` with the status code; message includes the URL.
- Empty taxonomy (page content changed / zero h4 matches): treat as drift → throw `[DRIFT_DETECTED]` explaining the expected anchor (`<h4>id <span>(name)</span>` inside `accordion-head-grp_*`) was not found. Must not silently return an empty list.
- Invalid `--group` value (not one of cs/econ/eess/math/physics/q-bio/q-fin/stat): throw `[INVALID_GROUP]` listing all 8 valid values (self-healing error message).
- No rate limiting concern for this command: it makes exactly 1 GET request per run (arXiv asks for ≥3s between requests; a single request trivially satisfies this). No pagination loop is needed.

## Capture Assessment

Capture is recommended. This is a verified, reproducible path with clear parameterization value: list-papers / search / get-author-papers all take `--category` from the ~155-value taxonomy, and users need an enumeration/discovery command. Implementation is a single deterministic GET + regex parse, no auth, no browser. Output `Array<{id, name, group}>` is stable and chainable (id feeds directly into the `--category` of sibling arxiv commands).
