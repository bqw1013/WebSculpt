# Context

## Precipitation Background (Why This Command Exists)

This command was created to provide a stable, programmatic way to search arxiv.org for academic papers. Unlike search-engine-based approaches that return unstable summaries, this command directly calls the official arxiv API and returns structured metadata, making it ideal for recurring literature monitoring and research workflows.

## Value Assessment

- **Generality**: Any arxiv search query (keywords, title, author, category) can be expressed via the `query` parameter using arxiv's boolean search syntax.
- **Reuse frequency**: High for researchers, students, and practitioners who need to stay current with specific fields.
- **Time saved**: Eliminates the need to manually open a browser, navigate to arxiv, perform a search, and copy results.

## Page Structure

- **API endpoint**: `https://export.arxiv.org/api/query`
- **Method**: GET
- **Response format**: Atom XML feed
- **Key XML elements per paper (`entry`)**:
  - `id` → paper URL with version suffix
  - `title` → paper title
  - `summary` → paper abstract
  - `author/name` → author names
  - `published` → submission date
  - `updated` → last update date
  - `category@term` → subject categories
  - `arxiv:primary_category@term` → primary category
  - `arxiv:comment` → optional submission comment
  - `link[@rel='alternate']@href` → HTML abstract page
  - `link[@title='pdf']@href` → direct PDF link

## Environment Dependencies

- No authentication required.
- No browser required; pure Node.js `https` request.
- arxiv recommends a rate limit of approximately 1 request per 3 seconds.
- HTTPS is mandatory; HTTP requests receive a 301 redirect.

## Failure Signals

- `API_ERROR`: Non-200 status code from arxiv. Could indicate rate limiting or service issues.
- `EMPTY_RESULT`: Zero `entry` elements in the feed. Valid query with no matches.
- `MISSING_PARAM`: `query` parameter missing or empty.
- **Drift detection**: If the XML structure changes (e.g., namespace prefix changes, element names change), the regex-based parser may return empty arrays for authors or categories. Consider switching to a proper XML parser if drift becomes frequent.

## Repair Clues

- **Alternative endpoint**: The arxiv API has a single stable endpoint; if `export.arxiv.org` is down, there is no direct alternative, but the search can be retried after a delay.
- **XML parsing fallback**: If the regex parser breaks due to structural changes, the Node.js built-in `util.parseArgs` or a lightweight XML parser could be used, but only built-in modules are permitted in this runtime.
- **Query syntax reference**: https://info.arxiv.org/help/api/user-manual.html#query_details
