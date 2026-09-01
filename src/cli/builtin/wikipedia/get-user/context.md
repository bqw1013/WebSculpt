# Context

## Precipitation Background (Why This Command Exists)

This command was created to fetch public Wikipedia editor statistics for collaboration and editor analysis. The MediaWiki Action API exposes a stable `list=users` endpoint that returns structured account data without authentication.

## Value Assessment

The command is reusable across any Wikipedia language edition and provides a single-call summary of editor status. It saves the caller from manually querying the MediaWiki API and normalizing user-page URLs.

## Page Structure

- API endpoint: `https://{lang}.wikipedia.org/w/api.php?action=query&list=users&ususers={username}&usprop=editcount|groups|registration|gender|rights|implicitgroups|blockinfo&format=json`
- User page URL pattern: `https://{lang}.wikipedia.org/wiki/User:{username}`

## Environment Dependencies

- Public internet access to `{lang}.wikipedia.org` (a suitable egress path may be required in restricted networks).
- No login required.
- An identifying caller header is sent per Wikimedia convention.

## Failure Signals

- `missing` or `invalid` field in the API response user object → user does not exist.
- Connection timeout or DNS failure → `NETWORK_ERROR`.
- HTTP 429 after retry → `RATE_LIMITED`.
- Missing `query.users` → `EMPTY_RESULT`.

## Repair Clues

- If the API returns fewer fields, check whether `usprop` parameter names changed in newer MediaWiki versions.
- If the URL normalization breaks, verify that the `User:` namespace prefix remains `User:` in the target language edition (it is stable in URLs even when localized in page display).
