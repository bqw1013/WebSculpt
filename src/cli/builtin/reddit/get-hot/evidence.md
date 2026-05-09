# Evidence: reddit/get-hot

This document records the research and validation evidence for the `reddit/get-hot` command.

## Exploration Path

1. Checked the WebSculpt command library with `websculpt command list`. No existing Reddit commands were found.
2. Attempted to use the Reddit public JSON API (`https://www.reddit.com/hot.json`) via Node.js `https` module. This path failed because Reddit's CDN/WAF treats Node.js TLS fingerprints differently from browsers, causing connection timeouts (~10s) and intermittent 403/429 responses.
3. Switched to browser automation (`runtime: browser`) to leverage real browser fingerprints and avoid the TLS fingerprint-based blocking.
4. Read `./references/access/playwright-cli-guide.md` for browser exploration guidelines.
5. Attached to the user's Chrome browser via `playwright-cli attach --cdp=chrome --session=default`.
6. Navigated to `https://www.reddit.com/hot/` in a new tab and inspected the DOM structure.
7. Discovered that Reddit renders posts as custom `<shreddit-post>` web components with rich data attributes containing all required fields (title, score, comments, subreddit, permalink, author).
8. Verified extraction via `page.evaluate()` in the browser context. The data-attribute approach is stable and avoids fragile DOM selectors.

## Verified URLs

- `https://www.reddit.com/hot/` — verified on 2026-05-09. Renders post cards as `<shreddit-post>` elements.
- `https://www.reddit.com/top/` — verified as an alternative sort view.
- `https://www.reddit.com/rising/` — verified as an alternative sort view.
- `https://www.reddit.com/new/` — verified as an alternative sort view.

## Structural Evidence

Reddit's front-page feed renders each post as a `<shreddit-post>` custom element with the following verified data attributes:

- `post-title` — post title string
- `subreddit-prefixed-name` — e.g. `"r/technology"`
- `score` — integer vote count string
- `comment-count` — integer comment count string
- `permalink` — relative path, e.g. `/r/technology/comments/.../`
- `content-href` — external link URL (for link posts)
- `author` — username string
- `created-timestamp` — ISO datetime string
- `post-type` — `"link"`, `"self"`, etc.

Posts are wrapped in `<article>` elements inside the feed container. Promoted/ad posts can be identified by the absence of a genuine subreddit or by checking for promoted indicators; the simplest filter is to require `subreddit-prefixed-name` to start with `"r/"`.

The extraction logic runs inside `page.evaluate()` and iterates `document.querySelectorAll('shreddit-post')`, reading the above attributes directly from each element.

## Failure Signals

- **Empty result**: If no `shreddit-post` elements are found after page load, the page structure may have changed or the user may be blocked. Throw `DRIFT_DETECTED`.
- **Promoted/Ad posts**: Reddit injects promoted posts into the feed. These are filtered out by requiring `subreddit-prefixed-name` to start with `"r/"`.
- **Navigation timeout**: If `page.goto()` exceeds 15s, throw `TIMEOUT`.
- **Rate limiting / CAPTCHA**: Reddit may show an interstitial or CAPTCHA for suspicious traffic. Browser runtime mitigates this with real browser fingerprints, but persistent blocks should surface as `DRIFT_DETECTED`.
- **Login gate**: Some content may require login; this command targets the public front-page feed which is accessible without authentication.

## Capture Assessment

This path should be captured. The browser-based approach bypasses the TLS fingerprint issue that blocks Node.js `https` requests. Using `shreddit-post` data attributes provides a stable, structured extraction path that is more resilient than DOM selectors. The `browser` runtime is the correct choice for this site.
