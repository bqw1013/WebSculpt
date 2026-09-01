# Context

## Precipitation Background

Wikipedia featured content (featured articles, lists, pictures) is a stable, high-quality catalog that is useful for content discovery. The command exposes this catalog per language edition through the public MediaWiki Action API.

## Value Assessment

High reuse value for researchers or dashboards that need a periodic feed of quality Wikipedia content. The API is public and requires no login, so the command is cheap to run and easy to maintain.

## Page Structure

- Endpoint: `https://{language}.wikipedia.org/w/api.php?action=query&list=categorymembers`.
- `cmtitle` is built from a maintained `language → kind → category` mapping table in `command.js`.
- `cmtype` is `page` for `articles`/`lists` and `file` for `images`.
- Results are filtered to `ns=0` for articles/lists and `ns=6` for images.
- Pagination uses `continue.cmcontinue`.

## Environment Dependencies

- Node runtime; no browser.
- Requires outbound HTTPS access to `{language}.wikipedia.org`.
- standard proxy-related environment variables are honored for corporate network environments.
- Requests include a descriptive `User-Agent` and a 200–700ms random delay between continuation pages.

## Failure Signals

- `INVALID_PARAM` for bad `kind`/`limit`/`language`.
- `EMPTY_RESULT` when the language/kind pair is unmapped or the filtered category is empty.
- `NETWORK_ERROR` for connectivity or non-2xx responses.
- `RATE_LIMITED` on HTTP 429.
- `DRIFT_DETECTED` if `query.categorymembers` is missing from the API response.

## Repair Clues

- If a language's category title changes, update `CATEGORY_MAP` in `command.js`.
- If the API starts rejecting `cmlimit=500`, lower the `pageSize` constant or make it adaptive.
- If a language adds a new featured kind (e.g. images for `ko`), add the category name to the mapping table.
