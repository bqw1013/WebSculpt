# Context

## Precipitation Background (Why This Command Exists)

DEV.to hosts a large volume of developer content. There was no existing WebSculpt command for querying DEV.to articles. This command captures a reusable path for listing articles by tag, user, or organization, with a stable API-first strategy and a browser fallback for resilience.

## Value Assessment

- Generality: covers the most common article discovery patterns on DEV.to.
- Reuse frequency: high for anyone tracking tags, users, or trending content.
- Time saved: avoids manually navigating feeds or writing one-off API calls.

## Page Structure

- API base: `https://dev.to/api/articles`
- Browser user/org page: `https://dev.to/{account}`
- Browser tag page: `https://dev.to/t/{tag}`
- Browser site-wide feed: `https://dev.to/`
- Article card selector: `article.crayons-story`
- Title/link selector: `a.crayons-story__hidden-navigation-link, h2 a, h3 a`
- Time selector: `time`
- Author selector: `a[href^="/@"]`
- Tag selector: `a.crayons-tag, a[href^="/t/"]`
- Reaction selector (user/org pages): `.multiple_reactions_aggregate`
- Reading time pattern: `\d+\s*min\s*read`
- Comment pattern: `\d+\s*comments?`

## Environment Dependencies

- Public Forem API requires no authentication.
- Browser fallback requires a browser with remote debugging enabled.
- The command uses random delays and small scroll movements during browser fallback to keep the interaction pattern neutral.

## Failure Signals

- API returns HTTP 429, 5xx, or a non-JSON response -> trigger browser fallback.
- API returns HTTP 200 with an empty array -> `EMPTY_RESULT`.
- Browser page title contains `404` or body contains "doesn't exist" -> `NOT_FOUND`.
- Expected article selectors return no matches -> `DRIFT_DETECTED` (page structure may have changed).

## Repair Clues

- If API responses change shape, check `https://developers.forem.com/api` for V1 updates.
- If DOM selectors fail, inspect `article.crayons-story` and its children on a live user/tag page.
- If browser remote debugging is unavailable, verify `chrome://inspect/#remote-debugging` is enabled.

## Test Scenarios

The following scenarios were executed after installation:

1. Default popular feed (`--limit 2`) — API path.
2. Latest sort (`--sort latest --limit 2`) — API path.
3. Top week (`--sort top --period week --limit 2`) — API path.
4. Top month (`--sort top --period month --limit 2`) — API path.
5. Top year (`--sort top --period year --limit 2`) — API path.
6. Top infinity (`--sort top --period infinity --limit 2`) — API path.
7. Tag filter (`--tag {tag} --limit 2`) — API path.
8. User filter (`--user {user} --limit 2`) — API path.
9. Organization filter (`--org {org} --limit 2`) — API path.
10. Browser fallback default feed (`--limit 2`) — browser path.
11. Browser fallback tag (`--tag {tag} --limit 2`) — browser path.
12. Browser fallback user (`--user {user} --limit 2`) — browser path.
13. Invalid sort (`--sort invalid`) — `INVALID_PARAM`.
14. Conflicting filters (`--tag {tag} --user {user}`) — `INVALID_PARAM`.
15. Invalid limit (`--limit 0`) — `INVALID_PARAM`.
16. Non-existent user via API — `EMPTY_RESULT`.
17. Non-existent user via browser — `NOT_FOUND`.
18. Non-existent tag via browser — `NOT_FOUND`.

All scenarios returned the expected `success`, `source`, article count, or error code.
