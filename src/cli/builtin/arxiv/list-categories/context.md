# Context

## Precipitation Background (Why This Command Exists)

arXiv has ~155 category values. Sibling commands (`arxiv/list-papers`, `arxiv/search`, `arxiv/get-author-papers`) all take a `--category` parameter from this taxonomy, but users cannot remember the values. Explore phase in a prior explore workspace (assessed passed 2026-08-14) verified that the official taxonomy page is a single static HTML document holding every category inline, so enumeration is a one-request operation.

## Value Assessment

High reuse value: this is the discovery mechanism for the `--category` values used by the rest of the arXiv command family. Any time a user needs the valid value for `--category`, or wants to filter by top-level subject, this command answers in one request (~0.7s). The group filter saves manual scrolling of 155 entries.

## Page Structure

- URL: `https://arxiv.org/category_taxonomy`
- Static HTML, all content inline in `<div id="category_taxonomy_list">`; accordion panels contain the data in the DOM (no JS rendering, no pagination, no login).
- Group blocks: `<h2 class="accordion-head" id="accordion-head-grp_{group}">` followed by `<div class="accordion-body" id="accordion-panel-grp_{group}">`.
- Category entries inside a group: `<h4>{id} <span>({name})</span></h4>`.
- 8 groups / 155 categories measured: cs=40, econ=3, eess=4, math=32, physics=51, q-bio=10, q-fin=9, stat=6.

## Environment Dependencies

- Node runtime, global `fetch`, no third-party packages.
- No login, no browser. Sends a desktop User-Agent header.
- Rate limiting: the command makes exactly 1 request per run, so it inherently satisfies arXiv's ≥3s between-requests policy. Do NOT add pagination loops or multiple requests — a single fetch returns the full taxonomy. If this command is ever extended to more requests, space them ≥3s and add randomized delay.
- The official category count can change if arXiv adds/removes categories; the command derives the group set from the response, so new groups work without code changes.

## Failure Signals

- Non-200 response → `HTTP_{status}` error (checked before parsing).
- Zero categories parsed → `DRIFT_DETECTED`: the page markup changed (missing `<h4>id <span>(name)</span></h4>` or `accordion-head-grp_*` anchors). Do not silently return an empty list.
- Invalid `--group` → `INVALID_GROUP` error listing all valid group values so the caller can self-correct.

## Repair Clues

- Alternative enumeration sources: the arXiv Archive page `https://arxiv.org/archive/` (archive-level ids only, no subcategories), and the API user manual's subject classification list (`https://arxiv.org/help/api/user-manual#subject_classifications`). The taxonomy page remains the authoritative full source.
- If the accordion markup changes but categories remain: fall back to scanning all `<h4>` elements that contain `<span>(...)</span>` and infer group from the id prefix of the first archive segment (less accurate for the physics group — e.g. `hep-th` would not map to physics by prefix alone — so prefer the group field).
