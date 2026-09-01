# Context

## Precipitation Background (Why This Command Exists)

Wikipedia collaboration data (who edited what and when) is valuable for editor behavior analysis and article monitoring. The existing `wikipedia/get-user` command provides aggregate account statistics, but there was no command to list a user's individual contributions. This command fills that gap by exposing the MediaWiki `list=usercontribs` API endpoint.

## Value Assessment

- **Generality**: Works across all Wikipedia language editions via the `--language` parameter.
- **Reuse frequency**: High for tracking bot activity, monitoring active editors, or auditing changes to a topic area.
- **Time saved**: Avoids manually paginating through `Special:Contributions` and parsing HTML.

## Page Structure

- API endpoint: `https://{language}.wikipedia.org/w/api.php`
- Key query parameters:
  - `action=query`
  - `list=usercontribs`
  - `ucuser={username}`
  - `ucdir=older` (newest first)
  - `ucprop=ids|title|timestamp|comment|size|sizediff|tags`
  - `uclimit={1..500}`
  - `uccontinue={token}` for pagination
- Response path: `query.usercontribs[]`
- Pagination token: `continue.uccontinue`

## Environment Dependencies

- Public MediaWiki API; no login required.
- Requires network access to `{language}.wikipedia.org`. in restricted networks a suitable egress path is necessary.
- Random 200–700ms sleep between paginated requests to be polite to the API.
- Respects standard proxy-related environment variables.

## Failure Signals

- `NETWORK_ERROR`: fetch fails, non-2xx HTTP status, or invalid JSON.
- `RATE_LIMITED`: HTTP 429 or API error code `ratelimited`.
- `INVALID_PARAM`: missing/empty `user`, malformed user URL, non-positive `limit`, invalid `language`.
- `EMPTY_RESULT`: API returns `query.usercontribs: []` (covers both non-existent users and users with no contributions).
- `DRIFT_DETECTED`: API response lacks `query.usercontribs` array.

## Repair Clues

- If the API response structure changes, check the exact shape of `query.usercontribs` items and update `mapContrib` accordingly.
- If the API starts rejecting the User-Agent, update `USER_AGENT` to match Wikimedia's current policy.
- If pagination breaks, verify that `continue.uccontinue` is still the correct token name.
- Browser fallback exists if needed: `Special:Contributions/{user}` with `li[data-mw-revid]` items, but this command is intentionally API-only per the confirmed contract.
