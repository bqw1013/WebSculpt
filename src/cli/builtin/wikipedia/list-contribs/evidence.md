# Evidence: wikipedia/list-contribs

This document records the research and validation evidence for the `wikipedia/list-contribs` command.

## Exploration Path

- Checked the existing WebSculpt command library: `wikipedia` domain already contains `get-article`, `get-daily`, `get-news`, `get-trending`, `list-category-members`, and `search`. No command covers "list a user's contributions".
- Loaded `websculpt-explore` and validated the MediaWiki Action API `list=usercontribs` endpoint via curl through a local egress path.
- Confirmed that the API is public, requires no authentication, and has no hard rate quota.
- Verified both `zh.wikipedia.org` and `en.wikipedia.org` endpoints return consistent JSON structures.
- Evaluated browser fallback using `Special:Contributions/{user}`; the DOM structure is stable, but the command will use API-only path per confirmed contract.
- `websculpt explore assess wikipedia-list-contribs` passed.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php?action=query&list=usercontribs&ucuser={user}&uclimit=5&ucprop=ids|title|timestamp|comment|size|sizediff|tags&format=json`
- `https://en.wikipedia.org/w/api.php?action=query&list=usercontribs&ucuser={user}&uclimit=3&ucprop=ids|title|timestamp|comment|size|sizediff|tags&format=json`
- `https://zh.wikipedia.org/wiki/Special:Contributions/{user}?limit=5`
- `https://en.wikipedia.org/wiki/Special:Contributions/{user}?limit=3`

## Structural Evidence

- Endpoint: `https://{language}.wikipedia.org/w/api.php`
- Query parameters:
  - `action=query`
  - `list=usercontribs`
  - `ucuser={username}`
  - `uclimit={1..500}` (API clamps larger values with a warning)
  - `ucprop=ids|title|timestamp|comment|size|sizediff|tags` (maximizes returned fields)
  - `ucdir=older` (default, newest first)
  - `format=json`
- Pagination: response may contain `continue.uccontinue`. Pass it as `uccontinue` in the next request until enough results are collected or no more continue token exists.
- Response shape:
  ```json
  {
    "batchcomplete": "",
    "continue": { "uccontinue": "...", "continue": "-||" },
    "query": {
      "usercontribs": [
        {
          "userid": {userid},
          "user": "...",
          "pageid": {pageid},
          "revid": {revid},
          "parentid": {parentid},
          "ns": {ns},
          "title": "...",
          "timestamp": "{timestamp}",
          "comment": "...",
          "size": {size},
          "sizediff": {sizediff},
          "tags": []
        }
      ]
    }
  }
  ```
- Empty result: both non-existent users and users with no contributions return `"usercontribs": []`. The command maps this to `EMPTY_RESULT`.
- Missing required parameter returns error code `missingparam`.

## Failure Signals

- `NETWORK_ERROR`: fetch throws or response status is not 2xx. Often caused by lack of suitable egress path access to wikipedia.org.
- `RATE_LIMITED`: MediaWiki returns HTTP 429 or error code `ratelimited`. Defensive error code reserved.
- `INVALID_PARAM`: empty or unparsable `user`, non-numeric `limit`, or `limit` less than 1.
- `EMPTY_RESULT`: API returns empty `usercontribs` array.
- API warnings for invalid `ucprop` or out-of-range `uclimit` do not block execution; the API clamps/defaults them. The command does not treat warnings as errors.

## Capture Assessment

This command should be captured. The API path is stable, public, requires no authentication, and returns structured data. It complements the existing `wikipedia/get-user` command by providing contribution details rather than aggregate statistics. The implementation is straightforward: construct the API URL, paginate via `uccontinue`, normalize and return all available fields.
