# Evidence: huggingface/get-discussion

This document records the research and validation evidence for the `huggingface/get-discussion` command.

## Exploration Path

Command library overlap check: `websculpt command list huggingface` shows installed commands `huggingface/get-papers`, `huggingface/list-models`, `huggingface/list-datasets`, `huggingface/list-spaces`, `huggingface/search`. None covers a single discussion detail. The new `huggingface/get-discussion` complements the parallel `huggingface/list-discussions` (chaining: list output `number` → get-discussion). Candidate `huggingface/get-discussion` was confirmed by the user on 2026-08-10.

Tool contract consulted before any Playwright CLI operation. Exploration used Playwright CLI attach to the user's Chrome (session `<session>`, own tab verified by URL/title, then closed and detached). All data was collected via in-page same-origin `fetch('/api/...')` returning structured JSON; the page DOM (Svelte-hydrated, no data-testid) was only cross-checked. Command-line networking (node/curl) cannot reach huggingface.co (curl HTTP 000 timeout), so the command must run through the browser.

## Verified URLs

- `https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255` — model PR discussion page; tab ownership confirmed (URL + title "deepseek-ai/DeepSeek-R1 · Update README.md"). DOM cross-check: `h2` = title, second `main` div = "<title> #255 by <author> opened ...", third div = comment area. Internal API is the data source.
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions/255` — 200, full discussion JSON (events[], isPullRequest, changes, diffUrl).
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions/244` — 200, 5 events (comment + title-change + 3 comment), includes a hidden comment.
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions/253` — 200, non-PR, no diff-related keys.
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions/254` — 200, non-PR, no diff-related keys.
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions?limit=50` — 200 list (num/title/isPullRequest/status) used to select test cases.
- `https://huggingface.co/api/datasets/HuggingFaceFW/fineweb/discussions/49` — 200, `repo.type` = "dataset", 7 events.
- `https://huggingface.co/api/spaces/multimodalart/minimax-h3/discussions/8` — 200, `repo.type` = "space".
- `https://huggingface.co/api/datasets/HuggingFaceFW/fineweb/discussions?limit=3` — 200, wrapped `{"discussions":[...]}`.
- `https://huggingface.co/api/spaces/multimodalart/minimax-h3/discussions?limit=3` — 200, wrapped `{"discussions":[...]}`.
- `https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255/files.diff` — 200, git diff text (README.md +6 -0).

Reused verified paths from a prior explore workspace: the discussion page `/discussions/{num}` is JS-rendered with heading (title + `#num`), author link + opened time, body comment list, and tabs Discussion / Files changed; browser in-page fetch of HF internal APIs is reliable.

## Structural Evidence

Discussion detail API shape (`GET /api/models/deepseek-ai/DeepSeek-R1/discussions/255`, HTTP 200):

```json
{
  "_id": "...",
  "num": 255,
  "title": "Update README.md",
  "status": "open",
  "createdAt": "2026-07-26T05:16:03.000Z",
  "pinned": false,
  "locked": false,
  "collection": "discussions",
  "author": { "name": "shyamwertyajm", "fullname": "Shyam Narayan", "avatarUrl": "...", "isPro": false },
  "org": { "name": "deepseek-ai", "fullname": "DeepSeek", "type": "org" },
  "repo": { "name": "deepseek-ai/DeepSeek-R1", "type": "model" },
  "isPullRequest": true,
  "changes": { "base": "refs/heads/main" },
  "filesWithConflicts": [],
  "diffUrl": "https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions/255/files.diff",
  "events": [
    { "type": "comment", "author": {"name":"shyamwertyajm","fullname":"Shyam Narayan"}, "createdAt": "...",
      "data": { "edited": false, "hidden": false, "numEdits": 0,
        "latest": { "raw": "", "html": "", "updatedAt": "...", "author": {...} },
        "editors": ["shyamwertyajm"], "reactions": [] } },
    { "type": "commit", "author": {"name":"shyamwertyajm",...}, "createdAt": "...",
      "data": { "subject": "Update README.md", "oid": "e8fb1c8a..." } }
  ]
}
```

Field behavior (verified):
- `events[]` is an ordered event stream. `type` observed values: `comment` (body/reply text in `data.latest.raw` markdown + `data.latest.html`), `commit` (PR commit; `data.subject`/`data.oid`), `title-change` (metadata event). Non-comment events must be skipped when building the comment thread.
- `body` = first `comment` event's `data.latest.raw`; `comments` = subsequent `comment` events, each with `author.name`, `createdAt` (use as `at`), `data.latest.raw`, and `data.hidden` (boolean; hidden comments' raw is the placeholder "This comment has been hidden").
- PR discussions (`isPullRequest: true`) additionally carry `changes`, `filesWithConflicts`, `diffUrl`. Normal discussions omit these keys entirely → command outputs `files_changed: null`.
- `diffUrl` text is standard `git diff`; parsing `diff --git a/{f} b/{f}` headers plus `+`/`-` lines yields per-file additions/deletions. Verified #255 → 1 file `README.md` +6 -0 (matches the page's "Files changed (+6 -0)" tab). There is NO `.../discussions/{num}/files` API (404).

Repo type resolution (command receives only `org/name`): wrong prefix 404s with `{"error":"Repository not found"}` (verified `/api/datasets/deepseek-ai/DeepSeek-R1/discussions/255`). Strategy: probe `models` → `datasets` → `spaces`, first HTTP 200 wins and defines `type`. The discussion page URL is built from the resolved type: model `https://huggingface.co/{repo}/discussions/{num}`, dataset `https://huggingface.co/datasets/{repo}/discussions/{num}`, space `https://huggingface.co/spaces/{repo}/discussions/{num}`.

## Failure Signals

- `number` not found on an existing repo → 404 `{"error":"No discussion found matching num #<n>"}` → command throws `NOT_FOUND`.
- Repo not found (all three type probes 404) → `{"error":"Repository not found"}` → `NOT_FOUND`.
- Bad params (repo not `org/name`, number not a positive integer) → `INVALID_PARAM` (validated before any network call).
- Navigation or in-page fetch failure → `NETWORK_ERROR` (no raw Playwright error surfaces).
- Browser not attached → daemon reports `BROWSER_ATTACH_REQUIRED`.
- HF rate limiting: 429/403 or CAPTCHA possible under rapid repeated requests (parallel HF batch). Command keeps random mouse-move/scroll/waits and must be run serially with spacing; no such signals were observed during explore (all 200).

## Capture Assessment

This command should be captured: single-discussion detail is the natural deep-dive after `list-discussions` (which the batch is producing), and no installed command can read a discussion thread. The path is fully verified end-to-end in explore with real data samples (model PR #255, model non-PR #244/#253/#254, dataset #49, space #8, error 404 messages, diff parsing +6 -0, type resolution across all three prefixes), is parameterizable, and is stable/reproducible via the in-page API. Capturing it enables chaining `list-discussions` → `get-discussion` and saves re-reading the JS-rendered discussion page.
