# Context

## Precipitation Background (Why This Command Exists)

Wikipedia articles embed extensive internal links that form a natural "related articles" network. While `wikipedia/get-article` already returns a small `related: string[]` subset, there was no dedicated command to retrieve only the in-page links with independent `limit` control and structured `{title, url}` output. This command fills that gap.

## Value Assessment

- High reuse value for topic expansion, graph building, and content analysis.
- Works across all Wikipedia language editions using the same Action API shape.
- No login or API key required.

## Page Structure

- Primary source: MediaWiki Action API `prop=links`.
- Endpoint: `https://{language}.wikipedia.org/w/api.php?action=query&prop=links&titles={title}&pllimit={limit}&plnamespace=0&format=json&formatversion=2`
- Response: `query.pages[].{pageid, ns, title, links: [{ns, title}]}`.

## Environment Dependencies

- Network access to `wikipedia.org` (suitable egress path may be required in restricted networks).
- `curl` binary available in the execution environment.
- standard proxy-related environment variables are respected by `curl`.
- Random 200–700 ms delay between request and response handling to be polite to the API.

## Failure Signals

- Page object contains `missing: true` → article does not exist.
- HTTP 429 → rate limited.
- HTTP non-2xx or connection failure → network error.
- API error object with `missingparam` / `invalidparam` / `badparams` → invalid parameter.

## Repair Clues

- If the API starts returning `pages` as an object instead of an array, `formatversion=2` may have been dropped; restore it.
- If the command returns too many non-article links, verify that `plnamespace=0` is still present.
- If `curl` is unavailable, the command will fail with `NETWORK_ERROR`; consider switching to a Node.js native `fetch` implementation with a custom egress-path agent.
