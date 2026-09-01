# Evidence: wikipedia/list-featured

This document records the research and validation evidence for the `wikipedia/list-featured` command.

## Exploration Path

- Checked the WebSculpt command library with `websculpt command list wikipedia` and confirmed no existing command lists Wikipedia featured content by kind.
- Verified the MediaWiki Action API `list=categorymembers` against language-specific featured-content categories for `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `ru`, `pt`, and `it`.
- Confirmed that portal pages (`Portal:特色內容`, `Wikipedia:Featured_content`) only show the newest samples, while category pages contain the full paginated catalog.
- No browser automation is required; the command uses the node runtime with direct HTTP requests.

## Verified URLs

- `https://{language}.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:{category}&cmlimit={limit}&cmtype={type}&cmprop=ids|title|type&format=json`

## Structural Evidence

- The command calls `action=query&list=categorymembers` on `{language}.wikipedia.org`.
- Each supported `(language, kind)` pair maps to a fixed category title. Examples:
  - `zh` + `articles` → `Category:{category}`
  - `en` + `lists` → `Category:{category}`
  - `ja` + `images` → `Category:{category}`
  - `de` + `images` → `Category:{category}`
  - `pt` + `articles` → `Category:{category}`
- `cmtype` is set to `page` for `articles`/`lists` and `file` for `images`.
- Results are filtered to the intended namespace (`ns=0` for articles/lists, `ns=6` for images) so that project/maintenance pages are not returned.
- Pagination uses `continue.cmcontinue`; the token is passed back as `cmcontinue` until the requested `limit` is satisfied or the category is exhausted.
- The API returns `pageid`, `ns`, `title`, and `type` for each member.
- URL construction: `https://{language}.wikipedia.org/wiki/{title}` with spaces converted to underscores and `:`/`/` preserved.

## Failure Signals

- Missing or unknown `kind` → `INVALID_PARAM`.
- `language` not present in the mapping table, or the chosen `kind` has no mapped category for that language → `EMPTY_RESULT`.
- Network failure or non-2xx HTTP response → `NETWORK_ERROR`.
- HTTP 429 → `RATE_LIMITED`.
- Empty category (no members after namespace filtering) → `EMPTY_RESULT`.
- Unexpected response shape (missing `query.categorymembers`) → `DRIFT_DETECTED`.

## Capture Assessment

This command should be captured. The API path is stable, public, and requires no authentication. The mapping table makes the command parameterizable across languages and content kinds, and the output is directly useful for discovering high-quality Wikipedia content.
