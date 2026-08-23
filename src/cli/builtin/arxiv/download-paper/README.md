# arxiv/download-paper

Download an arXiv paper's PDF to a local folder, named after the paper title.

## Description

Fetches `https://arxiv.org/pdf/{id}` and saves the PDF into `--output` (default: current directory). The file is named after the paper title, which is read from the abstract page `https://arxiv.org/abs/{id}` and sanitized for filesystem safety. Accepts new-style IDs (`2601.00001`), old-style IDs (`hep-th/9901001`), optional version suffixes (`v2`), and abs/PDF URLs. Requests are spaced ≥3s apart per arXiv API policy. No authentication required.

## Parameters

- `id` (required): arXiv paper ID or abs/PDF URL. Accepted forms:
  - new-style ID: `2601.00001`
  - new-style with version: `2601.00001v2`
  - old-style ID: `hep-th/9901001`
  - old-style with version: `hep-th/9901001v2`
  - abstract URL: `https://arxiv.org/abs/2601.00001`
  - PDF URL: `https://arxiv.org/pdf/2601.00001`

  The version suffix is passed through unchanged; a version that does not exist (e.g. `2601.00001v2` when only v1 exists) returns `NOT_FOUND`. IDs appear in results of `arxiv/list-papers`, `arxiv/search`, and `arxiv/get-author-papers`.

- `output` (optional, default current directory): local folder to save the PDF into. Relative paths are resolved against the directory where the command is run; absolute paths are used as-is; the folder is created automatically if it does not exist. The file is named `{sanitized title}.pdf`.

## Return Value

```json
{ "id": "2601.00001", "title": "...", "file": "<local-path>\\....pdf", "sizeBytes": 2484870 }
```

- `id`: the resolved arXiv ID (version suffix included, e.g. `hep-th/9901001v2`).
- `title`: the paper title from the abstract page.
- `file`: absolute path of the written PDF.
- `sizeBytes`: file size in bytes (verified to match the server's `Content-Length`).

## Usage

```
websculpt arxiv download-paper --id 2601.00001 --output ./downloads
websculpt arxiv download-paper --id hep-th/9901001v2
websculpt arxiv download-paper --id "https://arxiv.org/abs/2601.00001" --output ./papers
```

## Filename Sanitization

The title is cleaned before use as a filename:

- filesystem-unsafe characters `<>:"/\|?*` and control characters are replaced with `_`;
- trailing dots and spaces are removed;
- Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are prefixed with `_`;
- the name is truncated to 200 characters;
- `.pdf` is appended.

## Common Error Codes

- `MISSING_PARAM`: `id` is empty.
- `INVALID_ID`: the input is a URL but not an arxiv.org abs/PDF URL.
- `NOT_FOUND`: no paper for the given id/version (abstract page 404, or the title could not be read).
- `DOWNLOAD_FAILED`: the PDF request returned non-200, or the response content-type is not `application/pdf`.
- `NETWORK_ERROR`: could not reach arxiv.org.
