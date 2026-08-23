# Context

## Precipitation Background (Why This Command Exists)

The HF command family needed a single-discussion detail command so `list-discussions` results can be chained into a full thread read (title / body / comments). It is the discussion-page counterpart to `get-model` / `get-dataset` / `get-space`. Verified path came from a prior explore workspace.

## Value Assessment

- Reuse frequency: high — every community discussion deep-dive (question threads, feature requests, PR reviews) needs this.
- Generality: works for model / dataset / Space repos; the repo type is auto-detected, so the caller does not need to know it.
- Saves re-reading the JS-rendered discussion page; the internal API returns everything in one JSON payload.

## Page Structure

- Data source: internal API `GET /api/{models|datasets|spaces}/{repo}/discussions/{num}` via in-page fetch (HTTP 200 → JSON). No embedded page data; DOM is Svelte-hydrated with no `data-testid`.
- Repo type resolution: probe `models` → `datasets` → `spaces`; first HTTP 200 wins. A wrong prefix returns 404 `{"error":"Repository not found"}` and moves to the next type.
- `events[]` is an ordered stream; `type` ∈ `comment` | `commit` | `title-change` | ... . Body = first `comment` event's `data.latest.raw`; replies = subsequent `comment` events (author / createdAt / `data.latest.raw` / `data.hidden`); non-comment events are skipped.
- PR discussions (`isPullRequest: true`) carry `changes`, `filesWithConflicts`, `diffUrl`. Normal discussions omit these keys → command outputs `files_changed: null`. The diff at `diffUrl` is standard git diff; parse `diff --git` headers plus `+`/`-` lines for per-file additions/deletions. There is no `.../discussions/{num}/files` API (404).
- Canonical URL by type: model `https://huggingface.co/{repo}/discussions/{num}`, dataset `https://huggingface.co/datasets/{repo}/discussions/{num}`, space `https://huggingface.co/spaces/{repo}/discussions/{num}`.

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled (browser runtime); no login required.
- Command-line networking (node/curl) cannot reach huggingface.co; the command must run through the browser's network.
- Polite pacing (user requirement): random mouse-move/scroll and a random wait before the fetch; keep calls serial and spaced within the parallel HF command batch.

## Failure Signals

- `number` not found on an existing repo → 404 `{"error":"No discussion found matching num #<n>"}` → `NOT_FOUND`.
- Repo not found (all three type probes 404) → `{"error":"Repository not found"}` → `NOT_FOUND`.
- Navigation or in-page fetch failure → `NETWORK_ERROR`.
- Browser not attached → daemon raises `BROWSER_ATTACH_REQUIRED`.
- HF rate limiting: 429/403 or CAPTCHA under rapid repeated requests; not observed during explore (all 200).

## Repair Clues

- If the API shape changes (e.g. `events` renamed or comment fields moved), fall back to DOM: `main` contains an `h2` (title), a `<title> #num by <author> opened ...` block, and the comment area — but the DOM has no `data-testid`, so API-first is preferred.
- The discussion list API `/api/{type}/{repo}/discussions?limit=N` returns the same author/num/title fields and can regenerate numbers for re-verification.
- The diff parser is best-effort: if the `diffUrl` fetch fails, `files_changed` is returned with an empty `files` array instead of throwing, so the core thread data is never lost.
