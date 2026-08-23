# Evidence: reddit/discover-subreddits

## Exploration Path

- Checked the WebSculpt command library for existing Reddit commands (`websculpt command list reddit`). Existing commands (`reddit/get-feed`, `reddit/get-popular`, `reddit/search`) do not cover community discovery, so a new command is justified.
- Attached Playwright CLI session `<session>` to the user's Chrome and opened an owned tab at `https://www.reddit.com/explore/`.
- Inspected the `/explore/` main page and a category page (`/explore/29m4k39/technology/`) using `eval` and `snapshot`.

## Verified URLs

- `https://www.reddit.com/explore/`
- `https://www.reddit.com/explore/29m4k39/technology/`

## Structural Evidence

### Main discovery page (`/explore/`)

- Section blocks are `<in-feed-community-recommendations>` custom elements.
- Each block contains an `<h3>` title, e.g.:
  - `Recommended for you`
  - `Most popular`
  - `Curated picks`
- Community cards are `<community-recommendation>` elements inside a `<show-more-grid>`.
- Each card contains:
  - Anchor: `a[href^="/r/"]` → subreddit permalink.
  - Display name: first `<h4>` text.
  - Visitor count: `<faceplate-number>` text (e.g. `125K weekly visitors`).
  - Description: following `<p>` text.
  - Icon: `<img class="shreddit-subreddit-icon__icon">` `src`.

Sample card text:

```text
r/learnmachinelearning
learnmachinelearning

125K weekly visitors

Learn and stay up-to-date on the fascinating world of machine learning.
```

### Category pages

- Category links in the `/explore/` sidebar point to URLs like `/explore/<id>/<slug>/`.
- Category pages render sub-category headings and 100 `<community-recommendation>` cards by default.
- Each sub-category has a `Show more` button (`aria-label="Show more community recommendations"`) that loads additional cards.

## Failure Signals

- Page title stays generic and `<community-recommendation>` elements never appear → `DRIFT_DETECTED`.
- Body text contains "blocked by network security" or "you've been blocked" → `BLOCKED`.
- No matching category in the sidebar → `CATEGORY_NOT_FOUND`.
- Section heading not found on `/explore/` → `EMPTY_RESULT` or `DRIFT_DETECTED`.

## Capture Assessment

The extraction path is stable and reproducible: the same custom elements and heading texts were observed across multiple loads. The command can be parameterized by `section` and `category`, with `limit` bounded to 1–100. Capture as `reddit/discover-subreddits` with browser runtime.
