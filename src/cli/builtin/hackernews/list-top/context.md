# Context

## Background

On 2026-04-27, the user requested to fetch current popular articles from Hacker News. Exploration verified the complete path of obtaining `topstories` / `beststories` / `newstories` lists via the official HN Firebase REST API, then concurrently fetching `item` details. This path requires no authentication and has no anti-bot restrictions, making it suitable for capturing as a reusable command.

## Value Assessment

High. The HN Firebase API is stable and publicly accessible. The `type` and `limit` parameters make this command reusable for trending, best, and newest stories without modification.

## Data Source Characteristics

- **List Endpoints**
  - `https://hacker-news.firebaseio.com/v0/topstories.json`
  - `https://hacker-news.firebaseio.com/v0/beststories.json`
  - `https://hacker-news.firebaseio.com/v0/newstories.json`
  - Returns: Array of story IDs (~500 items), sorted by popularity / time

- **Detail Endpoint**
  - `https://hacker-news.firebaseio.com/v0/item/{id}.json`
  - Returns: Fields including `id`, `title`, `url`, `score`, `by`, `descendants`, `time`, `type`
  - If `url` is empty (e.g., `Ask HN`, `Show HN`), fallback to `https://news.ycombinator.com/item?id={id}`
  - The `type` field is used for filtering; only entries with `type === "story"` are kept

## Environment Dependencies

- No login state, cookies, or API key required
- The HN Firebase API is publicly available with generous rate limits
- Accessible via Node.js native `fetch`

## Failure Signals

| Symptom | Possible Cause |
|---------|---------------|
| List endpoint returns non-array | Firebase API structure changed |
| `item` endpoint returns `null` | Story deleted or ID does not exist |
| `title` / `url` fields missing | HN data model changed |
| All requests fail | Network issue or Firebase service unavailable |
| `type` is not `"story"` | Non-story types (Job / Poll) mixed in |

## Fix Hints

- If the Firebase API is deprecated, fallback to the Algolia HN Search API: `https://hn.algolia.com/api/v1/search?tags=front_page`
- If field absence causes filtering failure, relax the `type` filter or add field existence checks
- If more metadata (e.g., text content) is needed, extend by calling the Algolia `search_by_date` endpoint to obtain `story_text`
