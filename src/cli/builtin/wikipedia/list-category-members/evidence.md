# Evidence: wikipedia/list-category-members

This document records the research and validation evidence for the `wikipedia/list-category-members` command.

## Exploration Path

- Checked the WebSculpt command library: no existing `wikipedia` domain commands.
- Verified MediaWiki Action API `list=categorymembers` with curl (via an egress path) and confirmed response shape, pagination, parameter behavior, and error codes.
- Verified browser category-page SSR structure with playwright-cli attach as a fallback path; selectors confirmed stable on both zh and en editions.
- Consulted the node runtime contract before implementing `command.js`.

## Verified URLs

- https://zh.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:{category}&format=json
- https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:{category}&format=json
- https://zh.wikipedia.org/wiki/Category:{category}
- https://en.wikipedia.org/wiki/Category:{category}
- https://en.wikipedia.org/wiki/Category:{category} (file-type validation)

## Structural Evidence

MediaWiki Action API response shape:

```json
{
  "batchcomplete": "",
  "continue": { "cmcontinue": "...", "continue": "-||" },
  "query": {
    "categorymembers": [
      { "pageid": 0, "ns": 0, "title": "...", "type": "page" }
    ]
  }
}
```

- `pageid`: member page id.
- `ns`: namespace (0 article, 14 subcategory, 6 file, 100 portal, etc.).
- `title`: full page title including namespace prefix for subcats (`Category:...`) and files (`File:...`).
- `type`: `page`, `subcat`, or `file` when `cmprop` includes `type`.
- Pagination token: `continue.cmcontinue`. Pass it as `cmcontinue` for the next request.
- Max `cmlimit`: 500.

Parameter mapping:
- `cmtype=page` returns namespace 0/100/etc. articles.
- `cmtype=subcat` returns namespace 14.
- `cmtype=file` returns namespace 6.
- `cmtype=page|subcat|file` returns all three.

Empty / non-existent category: API returns HTTP 200 with `query.categorymembers: []` and no `error`.
Missing `cmtitle`: API returns `error.code: "missingparam"`.

Browser fallback selectors (validated but not used in node implementation):
- Pages: `#mw-pages .mw-category-group a[href^="/wiki/"]` (exclude `Category:`).
- Subcategories: `#mw-subcategories .mw-category-group a[href^="/wiki/Category:"]`.
- Files: `#mw-category-media .mw-category-group a[href^="/wiki/File:"]`.

## Failure Signals

- `NETWORK_ERROR`: cannot reach `{lang}.wikipedia.org` (common in restricted network environments without an egress path).
- `RATE_LIMITED`: defensive error code for MediaWiki rate limiting; not observed during exploration.
- `INVALID_PARAM`: unsupported `type`, out-of-range `limit`, malformed `category` URL, or unsupported language code format.
- `EMPTY_RESULT`: category has no members of the requested type, or category name does not exist.
- Drift signal (API): unexpected response shape or missing `query.categorymembers`; fallback to `DRIFT_DETECTED` if the contract is violated.

## Capture Assessment

This command should be captured. The API path is stable, publicly accessible, parameterizable across languages, and provides sufficient structured data for listing category members by type. The browser path was validated as a fallback but is not required because the API path is fully sufficient and has no observed rate limits.
