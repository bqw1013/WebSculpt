# Evidence: hackernews/get-top

This document records the research and validation evidence for the `hackernews/get-top` command.

## Exploration Path

1. Checked the WebSculpt command library (`websculpt command list`) — no existing hackernews-related commands were found.
2. Selected `curl` via Python `urllib` to call the HackerNews Algolia public API, as the task involves a stable, unauthenticated HTTP API with JSON response.
3. No browser automation or `guide.md` consultation was needed.

## Verified URLs

- `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=15`
  - Verified on 2026-05-09. Returns JSON with front-page stories from HackerNews.
  - No authentication required. No rate-limiting observed during exploration.

## Structural Evidence

The Algolia Search API endpoint returns a JSON object with the following structure:

- Root fields: `hits` (array), `nbHits`, `nbPages`, `hitsPerPage`, `page`, `processingTimeMS`, `query`, `serverTimeMS`.
- Each item in `hits` contains:
  - `title` (string): Story title.
  - `url` (string | null): External article URL. May be null for text posts.
  - `points` (number): Upvote count.
  - `num_comments` (number): Number of comments.
  - `author` (string): Submitter username.
  - `created_at` (string, ISO 8601): Submission timestamp.
  - `objectID` (string) / `story_id` (number): HN story identifier.
  - `children` (array of numbers): Comment IDs (can be used to infer discussion activity).

Query parameters:
- `tags=front_page` filters to front-page stories.
- `hitsPerPage=N` controls result count (max practical ~30).
- Sorting by `points` or `num_comments` can be done client-side after fetching.

## Failure Signals

- **Empty result**: `hits` array is empty. Return clear message, not an error.
- **Network/timeout**: Standard HTTP failure from `https` module. Should surface as `NETWORK_ERROR`.
- **API drift**: If Algolia changes field names or response shape, `validation` or runtime errors will occur. Monitor for missing expected fields and throw `DRIFT_DETECTED`.
- **Rate limiting**: Not observed, but if HTTP 429 occurs, surface as `RATE_LIMITED`.
- No authentication or login state is required.

## Capture Assessment

This path should be captured. The HN Algolia API is the official recommended public API for programmatic access to HackerNews front-page data. It is stable, fast (sub-20ms response time observed), requires no credentials, and the parameters (`hitsPerPage`) are easily reusable. Capturing this as a local command eliminates repeated API exploration and token consumption for future HN top-stories lookups.
