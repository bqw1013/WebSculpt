# Context

## Precipitation Background (Why This Command Exists)

This command was precipitated during an exploration on 2026-05-09 to quickly check HackerNews front-page hot topics. The HN Algolia Search API (`hn.algolia.com`) is the official public API and provides fast, structured access to front-page stories without scraping HTML or managing browser sessions.

## Value Assessment

- **Reuse frequency**: High. HN front-page checks are a common recurring task.
- **Time saved**: Eliminates repeated API endpoint discovery, parameter tuning, and JSON parsing boilerplate.
- **Stability**: Algolia API has been stable for years and is HN's recommended programmatic interface.

## Page Structure

- **Primary endpoint**: `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage={limit}`
- **Response format**: JSON with root `hits` array.
- **Key fields per hit**: `title`, `url`, `points`, `num_comments`, `author`, `created_at`, `objectID`.
- **HN discussion URL pattern**: `https://news.ycombinator.com/item?id={objectID}`

## Environment Dependencies

- **Runtime**: `node` (pure HTTPS request, no browser).
- **Authentication**: None required.
- **Rate limits**: Not observed during exploration; public endpoint is generally permissive.
- **Network**: Requires outbound HTTPS access to `hn.algolia.com`.

## Failure Signals

- `hits` array missing or not an array → `DRIFT_DETECTED`.
- Empty `hits` array → returns `[]` (not an error).
- HTTP 429 → `RATE_LIMITED`.
- HTTP >= 400 (other than 429) → `API_ERROR`.
- Request timeout or connection failure → `NETWORK_ERROR`.

## Repair Clues

- If Algolia API is unavailable, the fallback would be HN's Firebase REST API (`https://hacker-news.firebaseio.com/v0/topstories.json` followed by per-item fetches), but this requires N+1 requests and is less efficient.
- If field names change in the Algolia response, update the mapping in `command.js` and the `DRIFT_DETECTED` checks.
