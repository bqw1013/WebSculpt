# Context

## Precipitation Background (Why This Command Exists)

This command was created to answer the recurring question "What are the trending projects on GitHub recently?" without requiring manual web search every time. By encapsulating the GitHub Search API into a reusable WebSculpt command, users can quickly retrieve a ranked list of active, popular repositories with a single CLI call.

## Value Assessment

- **Generality**: Applicable to any user interested in open-source trends, technology research, or project discovery.
- **Reuse frequency**: High — GitHub trending is a frequent query for developers, PMs, and researchers.
- **Time saved**: Eliminates the need to open a browser, navigate to GitHub, apply filters, and manually extract data.

## Page Structure

- **Primary endpoint**: `https://api.github.com/search/repositories`
- **Query parameters**:
  - `q`: search query string (built from `period`, `language`, `stars:>10`)
  - `sort=stars`: sort by total star count
  - `order=desc`: descending order
  - `per_page={limit}`: pagination limit
- **Response format**: JSON with `total_count` and `items[]` array.

## Environment Dependencies

- No browser required.
- No login or authentication required.
- GitHub Search API has rate limits: 10 requests/minute for unauthenticated requests.
- Command uses `User-Agent: websculpt-github-get-trending` header.

## Failure Signals

- HTTP 403/429 from GitHub API indicates rate limiting.
- `items` array missing or empty indicates no matches.
- Unexpected JSON structure from GitHub API (rare, signals API drift).

## Repair Clues

- If GitHub Search API becomes unavailable, consider switching to `https://api.github.com/search/repositories` v3 alternatives or exploring third-party trending APIs (e.g., trendshift.io, OSSInsight) with browser automation.
- If rate limits become problematic, consider adding support for GitHub personal access tokens via an optional auth parameter.
