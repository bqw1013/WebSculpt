# github/list-topics

List GitHub's popular topics from https://github.com/topics. Returns the featured topic cards with title, description, and URL (`https://github.com/topics/<slug>`), which can be chained into `github/get-topic`. Reads the rendered topics page; no login required.

## Description

Browses the official GitHub topic directory ("Browse popular topics"). The page renders a fixed list of 16 featured topics; the command extracts them in page order and applies `--limit` as a truncation. The "Popular topics" sidebar chips are excluded (no description, rotate per load).

## Parameters

- `limit`: number, optional, default `20`, range 1–100.
  - Truncation semantics: the page shows a fixed list of 16 featured topics; `limit` returns the first N items in page order. `N >= 16` (including the default `20`) returns all 16; `N` outside 1–100 or non-numeric returns `INVALID_PARAM`.

## Return Value

```
Array<{ title: string, description: string, url: string }>
```

- `title`: display name as rendered on the page (e.g. `Front end`, `Node.js`), from `p.f3`.
- `description`: one-line topic description, from `p.f5`.
- `url`: `https://github.com/topics/<slug>` (e.g. `https://github.com/topics/rust`), usable as the topic input for `github/get-topic`.

## Usage

```
websculpt github list-topics
websculpt github list-topics --limit 5
websculpt github list-topics --limit 100
```

Example output (first item):

```json
{
  "title": "Awesome Lists",
  "description": "An awesome list is a list of awesome things curated by the community.",
  "url": "https://github.com/topics/awesome"
}
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not an integer between 1 and 100.
- `EMPTY_RESULT`: no topic cards found on the page (structure changed or access blocked).
- `NOT_FOUND`: reserved (this command has no resource parameter).
- `BROWSER_ATTACH_REQUIRED`: browser not connected — open Chrome/Edge with remote debugging enabled and retry.
- `NETWORK_ERROR`: failed to load `https://github.com/topics`.
