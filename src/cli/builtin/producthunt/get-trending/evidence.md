# Evidence: producthunt/get-trending

This document records the research and validation evidence for the `producthunt/get-trending` command.

## Exploration Path

1. Checked the WebSculpt command library via `websculpt command list` — no existing Product Hunt commands.
2. Read the Playwright CLI guide before browser automation.
3. Attached to the user's Chrome session via CDP and opened `https://www.producthunt.com` in a new tab.
4. Verified that `window.__INITIAL_STATE__`, `__APOLLO_STATE__`, and `__DATA__` are absent — the product list is SSR-rendered directly into the DOM.
5. Inspected network requests and confirmed Product Hunt uses GraphQL (`/frontend/graphql`) for interactions and navigation, but the daily leaderboard data is present in the initial HTML without additional API calls.
6. Extracted sample products from the DOM using `eval` and deduplicated by `/products/{slug}` href.
7. Navigated to `https://www.producthunt.com/leaderboard/daily/2026/6/3` and confirmed the same DOM structure, with fewer duplicate links than the homepage (36 vs 70).
8. Closed the self-created tab after extraction.

## Verified URLs

- `https://www.producthunt.com` — homepage showing today's top products
- `https://www.producthunt.com/leaderboard/daily/2026/6/3` — daily leaderboard for a specific date; URL pattern is `/leaderboard/daily/{year}/{month}/{day}`

## Structural Evidence

**Product card DOM structure:**
- Each product is wrapped in a container with class containing `"isolate"`.
- The product link is an `<a>` element with `href` starting with `/products/{slug}`.
- Inner text of the card contains, in order:
  1. Rank + title, e.g. `"1. InsForge Backend Branching"`
  2. Tagline, e.g. `"Git style branching for your backend"`
  3. Topic tags separated by `"•"`, e.g. `"Open Source"`, `"Developer Tools"`
  4. Vote count as a standalone numeric string, e.g. `"119"`

**Stable extraction strategy:**
1. Navigate to `https://www.producthunt.com/leaderboard/daily/{year}/{month}/{day}` (or homepage for today).
2. Query all `a[href^="/products/"]` elements.
3. For each link, walk up the DOM to the nearest ancestor with class containing `"isolate"`.
4. Parse `innerText` split by newlines, filter empty strings.
5. Deduplicate by `href`.
6. Extract: rank (leading number from title line), title (text after rank), tagline (next line), topics (lines before the vote count, excluding `"•"`), votes (standalone numeric line), slug (from href), url (`https://www.producthunt.com${href}`).

**Sample output:**
```json
{
  "rank": 1,
  "title": "InsForge Backend Branching",
  "tagline": "Git style branching for your backend",
  "votes": 119,
  "url": "https://www.producthunt.com/products/insforge-alpha",
  "topics": ["Open Source", "Developer Tools"],
  "slug": "insforge-alpha"
}
```

## Failure Signals

- **DRIFT_DETECTED**: If `a[href^="/products/"]` returns zero elements, or the ancestor with `"isolate"` class is not found, the page structure has changed. Also triggered if the Cloudflare JS challenge fails to resolve within 30 seconds.
- **EMPTY_RESULT**: If the leaderboard page loads but contains no product cards (e.g., for a future date or a date with no launches).
- **Cloudflare challenge**: Product Hunt now serves a Cloudflare interstitial on first visit from a new browser session. The challenge typically resolves in 5-10 seconds in a real Chrome browser. The command uses `waitUntil: "load"` and a 30s `waitForSelector` timeout to accommodate this. If the challenge fails (e.g., the browser environment is detected as a bot), the command will return `DRIFT_DETECTED`.
- No CAPTCHA or 403 observed during exploration, but excessive request frequency could trigger rate limiting.
- Product Hunt homepage contains ads and recommended products mixed with the daily leaderboard; using `/leaderboard/daily/...` reduces noise.

## Capture Assessment

This path should be captured. The daily Product Hunt leaderboard is a high-value signal for tech product trends, is publicly accessible without authentication, and the DOM structure is stable enough for browser-based extraction. The `/leaderboard/daily/{year}/{month}/{day}` URL pattern also enables historical queries, making the command more useful than a simple "today" scraper.
