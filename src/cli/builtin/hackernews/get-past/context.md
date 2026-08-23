# Context

## Precipitation Background (Why This Command Exists)

Hacker News exposes a `past` view that shows the front-page ranking for a historical day. The existing `get-new`, `get-top`, and `search` commands cover chronological submissions, the current front page, and Algolia search, but not dated front snapshots. Node fetch to the HN page domain is blocked in this environment, so exact page semantics are implemented with the attached browser runtime while Firebase supplies normalized item metadata.

## Value Assessment

The route is reusable for daily, monthly, and yearly historical snapshots and for paginated limits up to 50. It avoids re-discovering HN's page parameters and response fields for each date query.

## Page Structure

The primary URL is `https://news.ycombinator.com/front` or `front?day=YYYY-MM-DD`; pages after the first use `p=2`, `p=3`, and so on. The browser DOM selector is `tr.athing`; each row's `id` is the story ID and rows are in historical rank order. Item metadata comes from `https://hacker-news.firebaseio.com/v0/item/<storyId>.json`.

## Environment Dependencies

No HN login is required, but the WebSculpt daemon must attach to an existing Chrome/Edge session. The command uses one injected page, `domcontentloaded`, at most six concurrent Firebase detail calls, and a ten-page pagination cap. It does not launch or close the user's browser.

## Failure Signals

`INVALID_PARAM` protects against HN's silent fallback for malformed dates. Missing page titles or `tr.athing` IDs, or missing required Firebase fields, produce `DRIFT_DETECTED`; HTTP 429 produces `RATE_LIMITED`, other non-2xx responses produce `API_ERROR`, transport failures produce `NETWORK_ERROR`, and a valid page with no eligible stories produces `EMPTY_RESULT`. Runner attach failures such as `BROWSER_ATTACH_REQUIRED` are surfaced by WebSculpt.

## Repair Clues

If HN changes the row markup, update the DOM selector/parser while retaining the Firebase item schema. Do not substitute Algolia `search_by_date` for the primary path: it returns creation-time matches rather than the historical front-page snapshot.
