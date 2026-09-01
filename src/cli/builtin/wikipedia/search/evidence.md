# Evidence: wikipedia/search

## Exploration Path

- Checked the WebSculpt command library: no existing Wikipedia commands.
- Read `websculpt-capture` skill and `node-contract.md`.
- Verified the MediaWiki Action API search endpoint with `curl` through a local egress path.
- Confirmed browser fallback selectors with `@playwright/cli` (session `{session_id}`), then closed the tab and detached.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php`
- `https://en.wikipedia.org/w/api.php`
- `https://ja.wikipedia.org/w/api.php`
- `https://zh.wikipedia.org/w/index.php?title=Special:Search&search={query}&fulltext=1&ns0=1`
- `https://en.wikipedia.org/w/index.php?title=Special:Search&search={query}&fulltext=1&ns0=1`

## Structural Evidence

MediaWiki Action API search response shape:

```json
{
  "batchcomplete": "",
  "continue": { "sroffset": {sroffset}, "continue": "-||" },
  "query": {
    "searchinfo": { "totalhits": {totalhits}, "suggestion": "..." },
    "search": [
      {
        "ns": {ns},
        "title": "...",
        "pageid": {pageid},
        "size": {size},
        "wordcount": {wordcount},
        "snippet": "...<span class=\"searchmatch\">...</span>...",
        "timestamp": "{timestamp}"
      }
    ]
  }
}
```

Browser search page fallback selectors (verified on zh/en):

- Result container: `.mw-search-result`
- Title/link: `.mw-search-result-heading a`
- Snippet: `.searchresult`
- Meta: `.mw-search-result-data`
- Empty result: `.mw-search-nonefound`
- Pagination: `.mw-search-pager-bottom a[href*="offset"]`

## Failure Signals

- Missing `srsearch` parameter returns `error.code = "missingparam"`.
- No matches returns `query.searchinfo.totalhits = 0` and empty `query.search`.
- No `User-Agent` header causes Wikimedia to reject the request.
- Wikipedia.org is unreachable from some networks without a suitable egress path; the command honors standard proxy-related environment variables.
- 429 responses indicate rate limiting.

## Capture Assessment

This command should be captured. The MediaWiki Action API provides a stable, public, no-auth search endpoint with all required fields. Browser fallback is feasible but unnecessary; the command uses `node` runtime only.
