# Evidence: wikipedia/list-revisions

This document records the research and validation evidence for the `wikipedia/list-revisions` command.

## Exploration Path

- Checked the WebSculpt command library (`websculpt command list wikipedia`). No existing command provides article revision history; `wikipedia/get-article` only returns the latest revision summary.
- Verified the MediaWiki Action API `prop=revisions` endpoint through direct API calls (via a local egress path, due to network restrictions).
- Verified browser fallback by attaching to a local browser session via `@playwright/cli` and extracting revision rows from the article history page.
- Runtime decision: `node`. The API returns complete structured data; browser fallback is documented but unnecessary for the primary path.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=ids|timestamp|user|comment|size|tags|parsedcomment&titles=<ARTICLE_TITLE>&rvlimit=<N>&format=json&formatversion=2`
- `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=ids|timestamp|user|comment|size|tags|parsedcomment&titles=<ARTICLE_TITLE>&rvlimit=<N>&format=json&formatversion=2`
- `https://zh.wikipedia.org/w/index.php?title=<ARTICLE_TITLE>&action=history`

## Structural Evidence

### API Response Shape

Request (example, 3 revisions):

```
action=query
prop=revisions
rvprop=ids|timestamp|user|comment|size|tags|parsedcomment
titles=<ARTICLE_TITLE>
rvlimit=3
format=json
formatversion=2
```

Response:

```json
{
  "continue": {
    "rvcontinue": "{rvcontinue}",
    "continue": "||"
  },
  "query": {
    "pages": [
      {
        "pageid": {pageid},
        "ns": {ns},
        "title": "<ARTICLE_TITLE>",
        "revisions": [
          {
            "revid": {revid},
            "parentid": {parentid},
            "user": "<EDITOR_A>",
            "timestamp": "{timestamp}",
            "size": {size},
            "comment": "/* <SECTION_NAME> */",
            "parsedcomment": "<span class=\"autocomment\">...</span>",
            "tags": ["{tag}"]
          }
        ]
      }
    ]
  }
}
```

Observed fields:

- `revid`: revision ID (integer).
- `parentid`: previous revision ID (integer).
- `user`: editor username; for anonymous edits this is an IPv4/IPv6 string; temporary accounts may include `"temp": true`.
- `timestamp`: ISO 8601 UTC string.
- `size`: article size at this revision, when requested.
- `comment`: raw edit summary; empty string when absent.
- `parsedcomment`: HTML-rendered edit summary, when requested.
- `tags`: array of strings (e.g. `["visualeditor"]`), when requested.

### Pagination

The API uses `rvcontinue` in the format `{timestamp}|{revid}`. For this command the user-facing `limit` is capped at 500 (the API's own maximum), so a single request is sufficient.

### Default Limit Behavior

When `rvlimit` is omitted, the API returns **only 1 revision**. The command must always set `rvlimit` explicitly.

### Title Normalization

MediaWiki normalizes underscores to spaces and applies URL encoding. The API response returns the normalized `title` and `pageid`; the command uses these values in output.

### Browser Fallback Selectors

If the API path becomes unavailable, the equivalent history page is:

```
https://{lang}.wikipedia.org/w/index.php?title={title}&action=history
```

Verified selectors:

- Rows: `li[data-mw-revid]`
- Revision ID: `data-mw-revid` attribute
- Timestamp: `.mw-changeslist-date`
- Editor: `.mw-userlink`
- Comment: `.comment` (empty summary fallback `.mw-changeslist-empty`)

The browser timestamp is a localized string, so it would need parsing back to UTC ISO 8601 to match the API output.

## Failure Signals

- Missing article: HTTP 200, page object contains `"missing": true` → map to `NOT_FOUND`.
- Empty `titles` parameter: HTTP 200, empty `pages` array → map to `INVALID_PARAM`.
- Invalid `rvprop`: HTTP 200 with warning, revisions contain empty objects → defensive handling; should not occur for fixed prop list.
- Invalid `action`: HTTP 200 with `{ error: { code: "badvalue" } }` → defensive handling.
- HTTP 429 → `RATE_LIMITED`.
- Non-2xx HTTP status or JSON parse failure → `NETWORK_ERROR`.
- DNS/connect failure for invalid language code → `NETWORK_ERROR`.

## Capture Assessment

This command should be captured. The MediaWiki API path is stable, publicly accessible, and returns all required revision fields in a single request. It complements the existing `wikipedia/get-article` command by exposing full revision history rather than only the latest edit. Browser fallback is feasible and documented, but the primary implementation should use the `node` runtime for lower overhead and simpler pagination.
