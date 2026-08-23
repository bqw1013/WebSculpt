# Evidence: arxiv/download-paper

This document records the research and validation evidence for the `arxiv/download-paper` command.

## Exploration Path

- Command library check: `websculpt command list arxiv` shows only the builtin `arxiv/search-papers` (metadata + PDF links, no download). `websculpt command list bilibili` shows `bilibili/download`, but it is a browser-runtime command that delegates to yt-dlp — not a node-runtime file-write reference. Conclusion: `arxiv/download-paper` is a new command.
- Read the internal command-family plan (requirement source) and the internal command design guidelines.
- Read the node runtime contract reference before implementing `draft/command.js`.
- Explore evidence recorded in a prior explore workspace, including a working Node v22 prototype that mirrors the command logic end-to-end.
- Confirmed the node execution model from WebSculpt source (`dist/cli/engine/execution/dispatcher.js`): node commands are dynamically imported and run in the CLI's own process, so `process.cwd()` is the user's invocation directory; no `process.chdir` exists anywhere in the CLI.

## Verified URLs

- https://arxiv.org/pdf/2601.00001 — HTTP 200, `Content-Type: application/pdf`, `Content-Length: 2484870`
- https://arxiv.org/abs/2601.00001 — HTTP 200, contains `<meta name="citation_title" content="...">`
- https://arxiv.org/pdf/hep-th/9901001v2 — HTTP 200, `Content-Type: application/pdf`, `Content-Length: 141293`
- https://arxiv.org/abs/hep-th/9901001v2 — HTTP 200, contains `<meta name="citation_title" content="...">`
- https://arxiv.org/pdf/2601.00001v2 — HTTP 404 (that version does not exist)
- https://arxiv.org/pdf/9999.99999 — HTTP 404
- https://arxiv.org/abs/9999.99999 — HTTP 404

## Structural Evidence

- PDF endpoint: `https://arxiv.org/pdf/{id}` returns HTTP 200 with `Content-Type: application/pdf`; `Content-Length` matches the actual file size; no redirect observed (Node `fetch` follows redirects anyway). The downloaded body starts with the PDF magic bytes `%PDF-` (verified `%PDF-1.6`).
- Title endpoint: `https://arxiv.org/abs/{id}` returns HTML containing `<meta name="citation_title" content="{title}">`. Extracted with regex `/meta name="citation_title" content="([^"]*)"/`.
- ID input forms (all verified): new-style `2601.00001`, new-style+version `2601.00001v2`, old-style `hep-th/9901001`, old-style+version `hep-th/9901001v2`, abstract URL `https://arxiv.org/abs/{id}`, PDF URL `https://arxiv.org/pdf/{id}`. Version suffix passes through unchanged; a nonexistent version returns 404.
- Invalid or nonexistent IDs: both `/abs/{id}` and `/pdf/{id}` return HTTP 404 → command reports `NOT_FOUND`.
- Output path resolution: `path.isAbsolute(output) ? output : path.resolve(output)`; default `"."` (current directory, i.e. `process.cwd()`). Directory is created recursively if missing (`fs.mkdirSync(dir, { recursive: true })`).
- Filename sanitization rules (11-case self-test all passed): replace `<>:"/\|?*` and control chars `\x00-\x1F` with `_`; strip trailing dots/spaces; prefix Windows reserved device names (CON/PRN/AUX/NUL/COM1-9/LPT1-9, case-insensitive) with `_`; truncate to 200 chars; append `.pdf`.

## Failure Signals

- Abstract page returns non-200, or the `citation_title` meta is missing → `NOT_FOUND` (invalid/nonexistent id or version, or page drift).
- PDF request returns non-200 → `DOWNLOAD_FAILED`.
- PDF response `Content-Type` is not `application/pdf` → `DOWNLOAD_FAILED`.
- Network failure reaching arxiv.org → `NETWORK_ERROR`.
- arXiv rate limiting: consecutive requests must be ≥3s apart (official policy). The command sleeps 3.0–4.0s (3000 + random jitter) between the abstract and PDF requests. A 429 response would signal rate limiting; the spacing is the mitigation.
- Output directory not writable (permissions) or the path is a file → Node `fs` error surfaces.

## Capture Assessment

The path is fully verified end-to-end: real PDF downloads succeeded for new-style, old-style, versioned IDs and URL inputs, with absolute, relative and default output directories; written file sizes matched the server `Content-Length` exactly; PDF magic bytes confirmed; error paths (`NOT_FOUND`) return the proper error code. The path is parameterizable (`id`, `output`) and broadly reusable (downloading paper PDFs is a core researcher workflow). Capture as `arxiv/download-paper` with `runtime: node`.
