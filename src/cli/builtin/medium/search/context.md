# Context

## Precipitation Background (Why This Command Exists)

Medium was listed as a browser-capturable platform without a reusable command. The user requested a search-only command whose results retain enough native detail for downstream consumers, rather than a title/URL-only wrapper.

## Value Assessment

The public search page has a stable same-origin GraphQL path and native result objects for posts, people, publications, topics, and lists. Parameterized query/type/limit calls can therefore be reused without opening individual articles or issuing write actions.

## Page Structure

- Search URL: `https://medium.com/search/{posts|users|publications|tags|lists}?q=<query>`.
- GraphQL endpoint: `POST https://medium.com/_/graphql` with `SearchPosts` or `SearchEntities`, variables `query` and `pagingOptions:{limit,page}`.
- Post cards: `article[data-testid="post-preview"]`.
- People cards: `[data-testid="search-user-preview"]`.
- Publication cards: `[data-testid="search-pub-preview"]`.
- Topics and lists expose their visible entries under the semantic `main` element; generated class names are intentionally avoided.

## Environment Dependencies

The command runs in WebSculpt's browser runtime with an injected `page` attached to the user's existing Chrome/CDP session. Public Medium search worked without a separate login. API requests are same-origin and include browser credentials. Navigation and pagination use short randomized waits (roughly 300-650ms after navigation and 220-520ms between pages); DOM fallback waits for a result selector and performs one low-amplitude pointer/scroll nudge.

## Failure Signals

Non-2xx GraphQL responses, invalid JSON, GraphQL errors, missing `data.search.<section>.items`, navigation failure, or missing visible results trigger the fallback path. Valid GraphQL empty arrays are returned as empty results and do not trigger fallback. If both GraphQL and DOM extraction fail, the command throws `DRIFT_DETECTED` with the API failure reason.

## Repair Clues

If Medium changes GraphQL field names or the endpoint, re-run `websculpt explore new medium-search` and inspect a fresh `SearchPosts`/`SearchEntities` request from the page. Keep result records native and update `nativePage()` and the query strings together. If card markup changes, prefer new semantic `data-testid` or `main` boundaries over generated CSS classes. Re-run strict limit, pagination, API-empty, DOM fallback, and double-failure tests before finalizing.
