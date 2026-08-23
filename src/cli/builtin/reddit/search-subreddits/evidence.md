# Evidence: reddit/search-subreddits

This document records the research and validation evidence for the `reddit/search-subreddits` command.

## Exploration Path

- Checked the WebSculpt command library for existing Reddit commands; no existing `reddit/search-subreddits` command was found.
- Used `@playwright/cli` to attach to the user's Chrome session and explored the Reddit community search result page.

## Verified URLs

- `https://www.reddit.com/search/?q=python&type=communities`

## Structural Evidence

- The search type parameter for communities is `type=communities` (the UI tab label is "Communities").
- Each community result is rendered as a card with `data-testid="search-community"`.
- The description element has `data-testid="search-subreddit-desc-text"`.
- Inside each card:
  - An anchor `a[href^="/r/"]` links to the subreddit (e.g. `/r/Python/`).
  - An `<h2>` contains the qualified name (e.g. `r/Python`).
  - A child `search-telemetry-tracker` has `data-faceplate-tracking-context` JSON containing `subreddit.id`, `subreddit.name`, `subreddit.nsfw`, `subreddit.quarantined`.
  - The description paragraph is available via `[data-testid="search-subreddit-desc-text"]`.
  - Weekly visitor and contribution numbers are rendered as `faceplate-number` elements; `textContent` is the formatted string (e.g. `117K`) and the `number` attribute is the raw integer (e.g. `117139`).
  - The subreddit icon image uses the class `shreddit-subreddit-icon__icon`.
- `members` / `subscriber_count`, `created` / `created_utc`, `banner_url` / `header_img`, `is_default`, `is_user_subscribed`, `rules`, and `topic` are not visible on the community search card.
- Initial page load returns up to 10 community cards. Scrolling to the bottom triggers infinite scroll and loads ~10 additional cards per batch. No "Load more" button was observed for community results.
- Example extracted card:
  ```json
  {
    "subreddit_id": "t5_2qh0y",
    "name": "Python",
    "display_name": "Python",
    "subreddit": "r/Python",
    "description": "The largest Python community for Reddit! ...",
    "nsfw": false,
    "quarantined": false,
    "weekly_visitors": "117K",
    "weekly_visitors_raw": 117139,
    "weekly_contributions": "1.4K",
    "weekly_contributions_raw": 1413,
    "permalink": "https://www.reddit.com/r/Python/",
    "icon_url": "https://styles.redditmedia.com/t5_2qh0y/styles/communityIcon_lctik80p96tg1.png?width=64&frame=1&auto=webp&s=92baaacc951d52b5071629852df033d53cafa5ec"
  }
  ```

## Failure Signals

- Reddit may return a "You've been blocked by network security" page. The command checks `document.body.innerText` for this phrase after navigation and throws `BLOCKED`.
- If community cards do not appear after navigation, the command waits for `[data-testid="search-community"]` and throws `DRIFT_DETECTED` on timeout.
- Empty result set after successful load should produce `EMPTY_RESULT`.
- Page structure changes that break the selectors above will produce `DRIFT_DETECTED`.

## Capture Assessment

This path should be captured because:
- The Reddit community search URL and card selectors are stable across repeated loads.
- The input is parameterizable (`query`, `limit`).
- The extraction logic and polite pacing measures have been verified in the browser.
- There is no existing command in the library that covers this use case.
