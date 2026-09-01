# Evidence: wikipedia/get-article

This document records the research and validation evidence for the `wikipedia/get-article` command.

## Exploration Path

- Checked the WebSculpt command library: no Wikipedia domain or `get-article` command exists.
- Read the node runtime contract before editing `command.js`.
- Verified MediaWiki Action API and REST API responses through browser-mediated `fetch()` because the capture environment used an indirect egress path.
- Verified infobox extraction from both `action=parse` HTML (server-side parseable) and browser DOM (`table.infobox`).

## Verified URLs

- `https://zh.wikipedia.org/api/rest_v1/page/summary/{title}`
- `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts|categories|links|langlinks|info|revisions|pageimages&titles={title}&format=json`
- `https://zh.wikipedia.org/w/api.php?action=parse&prop=text&page={title}&format=json`
- `https://zh.wikipedia.org/wiki/{title}`
- `https://en.wikipedia.org/wiki/{title}`

## Structural Evidence

### REST summary endpoint

- Returns JSON with `title`, `pageid`, `description`, `thumbnail.source`, `extract`, `content_urls`, `revision`, `timestamp`.
- 404 on missing title: `{"status":404,"type":"Internal error"}`.

### Action API combined query

- `prop=extracts&explaintext=1&exintro=1` returns the lead paragraph as plain text.
- `prop=extracts&explaintext=1` (without `exintro`) returns the full article body.
- `prop=categories` returns objects with `title: "Category:Name"`; strip the prefix for output.
- `prop=links` returns in-page links as `{ ns, title }`; supports `plcontinue` pagination.
- `prop=langlinks` returns multilingual versions as `{ lang, title }`; supports `llcontinue` pagination.
- `prop=info&inprop=url|displaytitle` returns `fullurl`, `canonicalurl`, `displaytitle`, `touched`, `lastrevid`.
- `prop=revisions&rvprop=ids|timestamp|user|comment&rvlimit=1` returns the latest revision for `last_edited`.
- `prop=pageimages&piprop=thumbnail|original&pithumbsize=640` returns lead image candidates.

### Missing page signal

- Action API page object contains `"missing": ""` (empty string). Presence of the key indicates a missing page; do not rely on truthiness of the value.
- `action=parse` for a missing page returns HTTP 200 with `error.code = "missingtitle"`.

### Infobox extraction

- HTML contains `<table class="infobox ...">`.
- Row rules:
  - Two cells: first is key, second is value.
  - Single `th[colspan]`: section header.
- Strip `<style>` elements before extracting text to avoid CSS noise in values.
- Verified on both `zh.wikipedia.org` and `en.wikipedia.org` samples.

## Failure Signals

- `NETWORK_ERROR`: Capture environment relied on an indirect egress path to reach Wikimedia servers.
- `NOT_FOUND`: Action API page object has `missing` key; REST summary returns 404.
- `INVALID_PARAM`: Empty or malformed `title`, or unsupported `include` value.
- `RATE_LIMITED`: Defensive code for possible MediaWiki rate limiting (not observed in testing).
- `EMPTY_RESULT`: Language edition not supported or query returns no usable content.
- Drift signal: infobox table class changes or Action API response shape changes.

## Capture Assessment

This command should be captured. The MediaWiki public API provides all required structured data without authentication, and the infobox can be extracted from server-side HTML via `action=parse`. Runtime is `node`; browser fallback is feasible but not required for the initial implementation.
