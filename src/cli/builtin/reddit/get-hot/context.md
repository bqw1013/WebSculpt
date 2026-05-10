# Context

## Precipitation Background (Why This Command Exists)

This command was created after the Node.js `https` approach to Reddit's public JSON API proved unreliable in this network environment. Reddit's CDN/WAF identifies Node.js TLS fingerprints and applies rate limits or connection delays (~10s+), while Python and browser requests succeed normally. Switching to `browser` runtime with real browser fingerprints resolves this issue.

## Value Assessment

- **Generality**: Applies to any user wanting to monitor Reddit trends.
- **Reuse frequency**: High — trending topics are a common information need.
- **Time saved**: Eliminates manual browsing and copy-pasting; bypasses API restrictions.

## Page Structure

- **Primary URL**: `https://www.reddit.com/hot/`
- **Alternative URLs**: Replace `hot` with `top`, `rising`, or `new`
- **Post container**: `<shreddit-post>` custom element
- **Data attributes** (stable extraction path):
  - `post-title`
  - `subreddit-prefixed-name`
  - `score`
  - `comment-count`
  - `permalink`
  - `content-href`
  - `author`
- **Ad filtering**: Require `subreddit-prefixed-name` to start with `"r/"`

## Environment Dependencies

- **Browser required**: Uses Playwright `page.goto` and `page.evaluate`.
- **No authentication required**: Targets the public front-page feed.
- **Rate limits**: Real browser fingerprints significantly reduce the risk of blocking, but excessive rapid requests may still trigger Reddit's protections.

## Failure Signals

- No `shreddit-post` elements found after `networkidle` → `DRIFT_DETECTED`
- Navigation timeout (>15s) → `TIMEOUT`
- Empty results after filtering ads → `EMPTY_RESULT`

## Repair Clues

- If `shreddit-post` attributes change, inspect a live Reddit page in DevTools and update the attribute names in `page.evaluate`.
- If Reddit introduces a login wall for the front page, the command will need to require authentication or switch to an alternative entry point.
- Backup: Reddit's `.json` endpoints may become viable again if network conditions change.
