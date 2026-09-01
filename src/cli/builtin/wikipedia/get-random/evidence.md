# Evidence: wikipedia/get-random

This document records the research and validation evidence for the `wikipedia/get-random` command.

## Exploration Path

1. Checked the WebSculpt command library for existing Wikipedia commands. Found `get-article`, `get-daily`, `get-news`, `get-trending`, `list-category-members`, and `search`, but no `get-random`. Confirmed the need for a new command.
2. Verified the MediaWiki Action API `list=random` endpoint through an indirect egress path (because direct access to `*.wikipedia.org` was unavailable in the capture environment).
3. Tested multiple parameter combinations and boundary values for `list=random`.
4. Verified multi-language availability on `zh.wikipedia.org`, `en.wikipedia.org`, and `ja.wikipedia.org`.
5. Evaluated the browser fallback path `Special:Random` and recorded its selectors, but decided against using it as the primary path because it can only return one article per request and requires HTML parsing.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php?action=query&list=random&rnlimit=3&rnnamespace=0&format=json&origin=*`
- `https://zh.wikipedia.org/w/api.php?action=query&list=random&rnlimit=1&rnnamespace=0&format=json&origin=*`
- `https://zh.wikipedia.org/w/api.php?action=query&list=random&rnlimit=10&rnnamespace=0&format=json&origin=*`
- `https://zh.wikipedia.org/w/api.php?action=query&list=random&rnlimit=500&rnnamespace=0&format=json&origin=*`
- `https://en.wikipedia.org/w/api.php?action=query&list=random&rnlimit=2&rnnamespace=0&format=json&origin=*`
- `https://ja.wikipedia.org/w/api.php?action=query&list=random&rnlimit=2&rnnamespace=0&format=json&origin=*`
- `https://zh.wikipedia.org/wiki/Special:Random`
- `https://zh.wikipedia.org/api/rest_v1/page/random/title`
- `https://zh.wikipedia.org/api/rest_v1/page/random/summary`

## Structural Evidence

### Primary API endpoint

```text
GET https://{language}.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit={limit}&format=json&origin=*
```

Request headers:

```text
User-Agent: {user_agent}
```

Successful response shape:

```json
{
  "batchcomplete": "",
  "continue": {
    "rncontinue": "start|end|pageid|ns",
    "continue": "-||"
  },
  "query": {
    "random": [
      {
        "id": 1234567,
        "ns": 0,
        "title": "Article Title"
      }
    ]
  }
}
```

Key fields:
- `query.random[].id`: page ID (integer)
- `query.random[].ns`: namespace (0 = main article)
- `query.random[].title`: article title (string)

### Parameter limits observed

- `rnlimit` must be an integer between 1 and 500 inclusive. Values outside this range trigger warnings or errors:
  - `rnlimit=0`: warning "must be between 1 and 500", returns 1 result.
  - `rnlimit=abc`: error `badinteger`.
  - `rnlimit=500`: returns 500 results (verified; response size ~27 KB).
- `rnnamespace=0` restricts results to main-namespace articles.
- Invalid `rnnamespace` values produce a warning and fallback to another namespace (e.g. `ns=3` for User talk).

### URL construction

Article URL pattern:

```text
https://{language}.wikipedia.org/wiki/{encodeURIComponent(title)}
```

### Browser fallback (`Special:Random`)

- `https://{language}.wikipedia.org/wiki/Special:Random` returns a 302/303 redirect to a random article.
- Title extraction selectors (most reliable first):
  1. `<h1 id="firstHeading"><span class="mw-page-title-main">{title}</span></h1>`
  2. `<title>{title} - Wikipedia</title>` (language-specific suffix)
  3. Inline JS: `RLCONF.wgTitle` / `RLCONF.wgPageName`
- Drawbacks: one article per request, requires redirect following, HTML parsing, and DOM stability.

## Failure Signals

- `NETWORK_ERROR`: Direct connection to `*.wikipedia.org` fails with `SSL_ERROR_SYSCALL` (curl) or `fetch failed` (Node) in restricted network environments. The command requires internet access; users in restricted network environments need a suitable egress path.
- `INVALID_PARAM`: `limit` is not an integer or is outside 1–500; `language` is malformed.
- `RATE_LIMITED`: Wikimedia returns HTTP 429 or a rate-limit response (defensive; not observed during testing).
- `EMPTY_RESULT`: Not expected under normal conditions because `list=random` always returns results for namespace 0. Reserved for edge cases where filtering leaves no results.
- API drift signal: response no longer contains `query.random` array, or `title` field is missing. Throw `DRIFT_DETECTED`.

## Capture Assessment

This command should be captured. The MediaWiki Action API `list=random` is a stable, public, no-login endpoint that returns structured JSON. It supports up to 500 random articles per request across all language editions. The implementation is straightforward with Node fetch. A browser fallback exists but is unnecessary because the API is more capable and reliable.
