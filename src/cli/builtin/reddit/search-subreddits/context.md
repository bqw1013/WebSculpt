# Context

## Precipitation Background (Why This Command Exists)

Reddit has a dedicated community search page at `/search/?q=<query>&type=communities`. The project already had feed, post search, and community discovery commands, but no command for directly searching subreddits by keyword.

## Value Assessment

- Faster than browsing `/explore/` when the user already knows a keyword.
- Reusable for any topic; just change `query`.
- Complements `reddit/discover-subreddits` (browsing) and `reddit/search` (posts).

## Page Structure

- URL: `https://www.reddit.com/search/?q=<query>&type=communities`
- Result card selector: `[data-testid="search-community"]`
- Description selector inside card: `[data-testid="search-subreddit-desc-text"]`
- Subreddit link: `a[href^="/r/"]`
- Qualified name: `h2` text (e.g. `r/Python`)
- Display name: telemetry context `subreddit.name`, fallback to first non-empty line of card text
- Telemetry context: child `search-telemetry-tracker` has `data-faceplate-tracking-context` JSON containing `subreddit.id`, `subreddit.name`, `subreddit.nsfw`, `subreddit.quarantined`
- Weekly stats: two `faceplate-number` elements; `textContent` is the formatted value, `number` attribute is the raw integer
- Icon image: `img.shreddit-subreddit-icon__icon`
- Loading is infinite-scroll; each scroll loads ~10 more cards.

## Environment Dependencies

- Requires an attached Chrome/Edge instance with remote debugging.
- No login required, but being logged in reduces the chance of hitting platform rate limiting.

## Wait Strategy

Polite pacing delays were tuned to stay comfortably below common platform rate-limiting thresholds while keeping execution fast:

- Entry wait after navigation: 200–500 ms (`waitForStable`).
- Post-tab-confirmation pause: 200–500 ms.
- Between infinite-scroll batches: 300–800 ms.
- Pre-return pause: 0–500 ms.
- Mouse movements are kept small (±30 px from a random center point) and infrequent (50% on entry, 15% during scroll).

These values were chosen as a balance between speed and keeping requests polite. If Reddit starts returning `BLOCKED`/403/429/CAPTCHA, increase the ranges or add longer cooldowns between calls rather than removing the waits entirely.

## Failure Signals

- Platform rate limiting: body text contains "You've been blocked" or "blocked by network security" → `BLOCKED`.
- Community cards never appear after navigation/tab selection → `DRIFT_DETECTED`.
- No cards extracted after successful load → `EMPTY_RESULT`.

## Repair Clues

- If `type=communities` no longer renders community cards directly, the command falls back to clicking the Communities tab link whose `href` contains `type=communities`.
- If selectors change, inspect the new card element for `data-testid` attributes or heading structure.
- `members` / `subscriber_count`, `created` / `created_utc`, `banner_url` / `header_img`, `is_default`, `is_user_subscribed`, `rules`, and `topic` were checked on the search card but are not visible; do not hard-code them.
