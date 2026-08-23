# Context

## Precipitation Background (Why This Command Exists)

Product Hunt is a leading platform for discovering new tech products. Its daily leaderboard reflects the most upvoted product launches each day, making it a valuable signal for tech trends, startup activity, and emerging tools. This command was created to allow automated, repeatable access to this signal without manual browsing.

## Value Assessment

- **Generality**: Works for any date Product Hunt has data for, not just today.
- **Reuse frequency**: High for anyone tracking daily tech launches or doing competitive research.
- **Time saved**: Eliminates the need to open a browser, navigate to Product Hunt, and manually copy product names and vote counts.

## Page Structure

**Primary URL patterns:**
- Today: `https://www.producthunt.com`
- Specific date: `https://www.producthunt.com/leaderboard/daily/{year}/{month}/{day}`

**DOM selectors:**
- Product link: `a[href^="/products/"]`
- Card container: ancestor with class containing `"isolate"`
- Rank + title: first line of card innerText, pattern `/{rank}. {title}/`
- Tagline: second line of card innerText
- Topics: lines between tagline and vote count, excluding `"•"`
- Votes: standalone numeric line in card innerText

**Extraction flow:**
1. Navigate to target URL.
2. Wait for `a[href^="/products/"]` to appear.
3. For each product link, walk up to the `"isolate"` ancestor.
4. Parse `innerText` by lines, deduplicate by `href`.
5. Sort by rank and slice to `limit`.

## Environment Dependencies

- **Browser**: Requires a browser runtime (CDP attach).
- **Login**: Not required. The leaderboard is publicly accessible.
- **Polite pacing**: No CAPTCHA or 403 observed during exploration. Normal browsing frequency should be safe.
- **Stability**: The `"isolate"` class and `/products/{slug}` link pattern have been stable, but class names could drift.

## Known Timezone Issue (Fixed 2026-06-12)

Product Hunt publishes its daily leaderboard on Pacific Time (PT). For users in earlier timezones (e.g., Asia/Europe morning), "today's" leaderboard may not yet exist, causing `EMPTY_RESULT`. The fix: when no `--date` is explicitly provided, the command first tries today; if the result is empty it automatically falls back to yesterday. When an explicit `--date` is given the command uses that date verbatim (no fallback), preserving the caller's intent.

## Cloudflare Challenge (Mitigated 2026-06-12)

Product Hunt added Cloudflare bot protection. On first visit from a new browser/CDP session, a JavaScript challenge interstitial is served (page title: "请稍候…"). The challenge typically resolves in 5-10 seconds in a real Chrome browser. Mitigations applied:

- Changed `waitUntil` from `"domcontentloaded"` to `"load"` — ensures Cloudflare JS finishes executing before checking for product cards.
- Increased `waitForSelector` timeout from 15s to 30s to accommodate slow challenge resolution.
- Added 30s `goto` timeout to prevent hanging if Cloudflare never resolves.

If Cloudflare detection becomes more aggressive (e.g., detecting CDP-attached browsers), the command may need additional adjustments or may become infeasible.

## Failure Signals

- `DRIFT_DETECTED`: Thrown when `a[href^="/products/"]` does not appear within 15 seconds. Indicates a page structure change.
- `EMPTY_RESULT`: Thrown when the selector matches but parsing yields zero valid products. Could happen for future dates, dates with no launches, or when both today and yesterday return empty.

## Repair Clues

- If the `"isolate"` class is removed, try broader ancestor traversal (e.g., fixed number of `parentElement` steps).
- If `/products/{slug}` links change to a different path, update the selector accordingly.
- As a fallback, the homepage (`https://www.producthunt.com`) can be used instead of the leaderboard URL, though it contains more noise (ads, recommendations).
