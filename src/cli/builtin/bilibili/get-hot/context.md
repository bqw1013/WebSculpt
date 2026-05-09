# Context

## Precipitation Background (Why This Command Exists)

This command was created to provide a quick, reusable way to check Bilibili's real-time hot search trending topics without needing to open a browser or perform manual web scraping. The official hotword API is public, stable, and requires no authentication, making it ideal for automation and recurring queries.

## Value Assessment

- **Generality**: Applies to anyone interested in Bilibili trending content, including content creators, analysts, and casual users.
- **Reuse frequency**: High — hot search data changes frequently and is often queried.
- **Time saved**: Eliminates the need to open a browser, navigate to Bilibili, and manually inspect the hot search section.

## Page Structure

- **Primary URL**: `https://s.search.bilibili.com/main/hotword`
- **Method**: HTTP GET
- **Response format**: JSON
- **Key fields**: `list` (array), `list[].keyword`, `list[].show_name`, `list[].heat_score`, `list[].heat_layer`, `list[].icon`

## Environment Dependencies

- **Runtime**: `node` — pure HTTP request, no browser needed.
- **Authentication**: None required.
- **Anti-crawl**: No special anti-crawl measures observed. Standard `User-Agent` header is used.
- **Stability**: The API is an official Bilibili endpoint and has been stable in testing.

## Failure Signals

- `code !== 0` in API response: Indicates API-side error or structural change.
- Missing or empty `list` array: Could indicate a temporary outage or API change.
- HTTP non-2xx status: Network-level failure.
- If `heat_score` disappears from the response, the ranking logic would need adjustment.

## Repair Clues

- The official Bilibili hot search page (`https://www.bilibili.com`) can be used as a fallback reference if the API structure changes.
- Alternative aggregate APIs (e.g., third-party hot list APIs) exist but may have lower stability.
- If the endpoint is deprecated, look for similar endpoints under `api.bilibili.com` or `s.search.bilibili.com`.
