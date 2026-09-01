# Context

## Precipitation Background (Why This Command Exists)

DEV.to is a popular developer community. Searching for articles by keyword is one of the most common ways to discover content on the platform. This command captures the verified search path so users can run it repeatedly without re-exploring the API or page structure.

## Value Assessment

- High reuse value: keyword search is a frequent operation.
- Stable entry point: the `/search` page and the Forem `/api/articles/search` endpoint are long-standing.
- Resilient: API-first with browser fallback handles the API's 500 responses for unmatched queries.

## Page Structure

- Search page: `https://dev.to/search?q=<query>`
- Sort navigation: `nav[aria-label="Search result sort options"]` with `Most Relevant`, `Newest`, `Oldest`
- Result cards: `article.crayons-story`
  - Title: `h3 a`
  - Author: `a.crayons-story__secondary`
  - Tags: `a.crayons-tag`
  - Date: `time`
  - Reading time: text matching `\d+ min read`
  - Comments link: anchor whose `href` contains `#comments`
- Sort URL params:
  - newest: `sort_by=published_at&sort_direction=desc`
  - oldest: `sort_by=published_at&sort_direction=asc`

## Environment Dependencies

- No login required.
- Browser runtime requires a browser with remote debugging enabled.
- API path uses the public Forem API without authentication.

## Failure Signals

- API returns 500 for many unmatched queries; this triggers browser fallback.
- API without `q` returns default featured articles; the command rejects empty queries with `INVALID_PARAM`.
- Browser empty result: zero `article.crayons-story` elements → `EMPTY_RESULT`.
- Missing or changed selectors → `DRIFT_DETECTED` / `NETWORK_ERROR`.

## Repair Clues

- If the API starts supporting sort parameters, the `sort === "newest" || sort === "oldest"` branch can be updated to try the API first.
- If result cards change structure, update selectors in `searchViaBrowser`.
- If the API stops returning 500 for empty queries, the fallback logic can be simplified.
