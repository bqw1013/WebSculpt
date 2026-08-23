# Context

## Precipitation Background

`substack/get-feed` was created to fill a gap in the Substack command set. Existing commands cover trending topics, leaderboards, search, and subscriptions, but there was no command to fetch the home feed or browse category feeds.

## Value Assessment

High reuse value for users who want to scan their Substack subscriptions or discover content in a specific category without opening the site. The command provides a stable, structured output that can be piped to other tools.

## Page Structure

- Personal feed API: `GET https://substack.com/api/v1/reader/feed?tab=for-you&type=base`
- Category feed API: `GET https://substack.com/api/v1/search/explore/web?tab=<slug>&type=category&sort=<sort>`
- Category tabs/slugs API: `GET https://substack.com/api/v1/reader/feed/tabs?surface=explore&selectedTab=technology&type=category`
- Pagination: cursor-based via `nextCursor` query parameter.
- The command navigates to `https://substack.com/` first so that in-page `fetch` includes the user's cookies.

## Environment Dependencies

- Browser runtime requires Chrome remote debugging.
- Personal feed requires a logged-in Substack session in the attached Chrome.
- Category feeds work without login.
- Substack uses Cloudflare; direct HTTP requests without a browser often fail, which is why browser runtime is used.

## Failure Signals

- Personal feed API returns 401/403 → `AUTH_REQUIRED`.
- Response does not contain an `items` array → `DRIFT_DETECTED`.
- No usable items after filtering → `EMPTY_RESULT`.
- Unknown category slug → `INVALID_PARAM`.

## Repair Clues

- If the internal API endpoints change, check the Network tab on `https://substack.com/` and `https://substack.com/explore/category/<slug>` for updated `reader/feed` or `search/explore/web` URLs.
- If category slugs change, fetch the tabs API and update `CATEGORY_SLUGS` in `command.js`.
- If item normalization breaks, inspect the shape of `post`, `comment`, and `context` fields in the API response.
