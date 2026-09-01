# Context

## Precipitation Background (Why This Command Exists)

Wikipedia articles evolve through collaborative edits. Monitoring the edit history of an article reveals who changed what and when, which is valuable for content analysis, trend detection, and vandalism tracking. The existing `wikipedia/get-article` command only exposes the latest revision; this command fills the gap by providing the full revision history.

## Value Assessment

- Generality: any public Wikipedia article in any language edition.
- Reuse frequency: high for monitoring, research, and reporting workflows.
- Time saved: avoids manual navigation to article history pages and parsing HTML.

## Page Structure

Primary source: MediaWiki Action API.

- Endpoint: `https://{language}.wikipedia.org/w/api.php`
- Fixed parameters:
  - `action=query`
  - `prop=revisions`
  - `rvprop=ids|timestamp|user|comment|size|tags|parsedcomment`
  - `rvlimit={limit}` (always set explicitly; API default is 1)
  - `format=json&formatversion=2`
- Input parameter: `titles={title}`

Browser fallback (documented, not implemented):

- URL: `https://{language}.wikipedia.org/w/index.php?title={title}&action=history`
- Row selector: `li[data-mw-revid]`
- Fields:
  - revid: `data-mw-revid`
  - timestamp: `.mw-changeslist-date` (localized, needs parsing)
  - user: `.mw-userlink`
  - comment: `.comment` or `.mw-changeslist-empty`

## Environment Dependencies

- Public MediaWiki API; no login required.
- Network access to `{language}.wikipedia.org`.
- Regional restrictions may require a suitable egress path.
- Respects standard proxy-related environment variables.
- Random sleep (200–700 ms) between calls for politeness.

## Failure Signals

- API returns page with `"missing": true` → `NOT_FOUND`.
- API returns `data.error` with `code === "missingparam"` → `INVALID_PARAM`.
- HTTP 429 → `RATE_LIMITED`.
- Non-2xx status or JSON parse failure → `NETWORK_ERROR`.
- Unexpected missing `query.pages` → `INVALID_PARAM`.
- Empty revision list for an existing page → `EMPTY_RESULT`.

## Repair Clues

- If the API starts rejecting the fixed `rvprop` list, validate the prop names against the latest MediaWiki API documentation.
- If `page.revisions` disappears or changes shape, treat as `DRIFT_DETECTED`.
- If rate limits become stricter, increase the polite sleep range or reduce the default `limit`.
- Browser fallback selectors are documented above if the API path becomes unavailable.
