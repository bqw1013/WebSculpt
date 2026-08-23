# Context

## Precipitation Background

Reddit's `/explore/` page surfaces community recommendations, popular communities, curated picks, and category browsing. None of the existing WebSculpt Reddit commands expose this discovery surface, so this command was created to let users find relevant subreddits without prior knowledge of their names.

## Value Assessment

- **Reuse value**: High for research, trend monitoring, and finding communities around a topic.
- **Time saved**: Avoids manually browsing `/explore/` and copying community names.
- **Generality**: Works for anonymous users; no API key needed.

## Page Structure

- Main page: `https://www.reddit.com/explore/`
  - Section blocks: `<in-feed-community-recommendations>`
  - Section titles: `<h3>` (`Recommended for you`, `Most popular`, `Curated picks`)
  - Cards: `<community-recommendation>` inside `<show-more-grid>`
- Category pages: `https://www.reddit.com/explore/<id>/<slug>/`
  - Discovered dynamically from the `/explore/` sidebar links.
  - Render sub-category headings and many `<community-recommendation>` cards.
- Card anatomy:
  - `a[href^="/r/"]` → permalink and name
  - `h4` → display name
  - `faceplate-number` → weekly visitor count
  - `p` → description
  - `img.shreddit-subreddit-icon__icon` → icon URL

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled.
- Public page; no login required.
- Uses random delays, occasional mouse movement, and bounded load rounds to keep a polite pacing profile.

## Failure Signals

- `BLOCKED`: body text contains "blocked by network security".
- `DRIFT_DETECTED`: `community-recommendation` elements do not appear after navigation.
- `EMPTY_RESULT`: section heading found but contains no cards.
- `CATEGORY_NOT_FOUND`: supplied category does not match any sidebar link text; the error message now lists the current available categories read from the sidebar.

## Repair Clues

- If section titles change, update `headingMap` in `command.js`.
- If category URLs change format, update the sidebar link parsing; the command dynamically resolves category names to URLs.
- If cards stop exposing `faceplate-number` or `shreddit-subreddit-icon__icon`, fall back to parsing the card's `innerText` lines.
