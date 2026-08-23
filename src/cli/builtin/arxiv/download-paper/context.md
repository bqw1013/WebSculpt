# Context

## Precipitation Background (Why This Command Exists)

Part of the arXiv command family planned in an internal command-family plan. The existing builtin `arxiv/search-papers` returns metadata and PDF links but does not save the PDF. `download-paper` adds "save the full text to a local folder", the natural next step for researchers who want to read or archive a paper offline. Exploration and contract were validated in a prior explore workspace.

## Value Assessment

- General: works with any arXiv ID or URL — new-style, old-style, with or without version suffix.
- Reuse frequency: high; downloading paper PDFs is a core researcher workflow.
- Saves hand-rolled fetch/save steps and enforces the arXiv ≥3s request-spacing policy automatically.
- Deterministic output: file named after the paper title, size verified against the server.

## Page Structure

- Title: `https://arxiv.org/abs/{id}` → HTML with `<meta name="citation_title" content="{title}">` (regex-extracted).
- PDF: `https://arxiv.org/pdf/{id}` → HTTP 200, `Content-Type: application/pdf`, body starts with `%PDF-`.
- No redirects observed in exploration; Node `fetch` follows redirects if any appear later.

## Environment Dependencies

- Node runtime command; runs in the CLI's own process (dynamic import), so `process.cwd()` is the directory where `websculpt` was invoked — relative `output` resolves there. Global `fetch` and Node built-ins `fs`/`path` are available; no third-party modules.
- No login, no browser.
- Polite pacing: arXiv asks for ≥3s between consecutive requests; the command sleeps 3.0–4.0s between the abstract and PDF requests. Tests against arXiv must be strictly serial with random inter-batch delays.

## Failure Signals

- Abstract page returns non-200, or `citation_title` meta is missing → `NOT_FOUND` (invalid/nonexistent id or version, or page drift).
- PDF request returns non-200 → `DOWNLOAD_FAILED`.
- PDF response content-type is not `application/pdf` → `DOWNLOAD_FAILED`.
- 429 response would indicate rate limiting; the ≥3s spacing is the mitigation.
- Output directory not writable, or the `output` path is an existing file → Node `fs` error surfaces to the caller.

## Repair Clues

- If `citation_title` meta changes shape, fall back to the Atom API (`https://export.arxiv.org/api/query?id_list={id}`) for the title.
- If `/pdf/{id}` changes, check for a redirect or a new CDN host — Node `fetch` follows redirects; if it stops returning `application/pdf`, re-validate the content-type check.
- If the filename length limit is ever a problem for very long titles, the 200-char cap is the lever to adjust.
