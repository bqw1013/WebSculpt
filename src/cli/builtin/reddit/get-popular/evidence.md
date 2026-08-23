# Evidence: reddit/get-feed

This document records the research and validation evidence for the `reddit/get-feed` command.

## Exploration Path

- Checked existing command library: `reddit/get-hot` fetches the front-page feed with `hot`, `top`, `rising`, `new` sorting via `https://www.reddit.com/{sort}/`.
- Used browser automation (`@playwright/cli`) to verify the Reddit front-page navigation and post extraction logic.
- Confirmed that the front-page feed also exposes a `Best` sort tab at `https://www.reddit.com/best/?feed=home`, and the plain URL `https://www.reddit.com/best/` renders `shreddit-post` elements successfully.

## Verified URLs

- https://www.reddit.com/
- https://www.reddit.com/best/
- https://www.reddit.com/hot/
- https://www.reddit.com/top/
- https://www.reddit.com/rising/
- https://www.reddit.com/new/

## Structural Evidence

- Reddit renders posts as custom elements `<shreddit-post>`.
- Relevant attributes on each `<shreddit-post>`:
  - `subreddit-prefixed-name`: e.g. `r/technology`
  - `post-title`: post title text
  - `score`: vote score as string
  - `comment-count`: number of comments as string
  - `permalink`: relative post path
  - `content-href`: external or media URL when present
  - `author`: username
- Reddit lazy-loads additional posts on scroll. The command scrolls incrementally until the requested `limit` is met or a maximum scroll count is reached.
- Front-page sort tabs are rendered at the top of the feed with links to `/best/`, `/hot/`, `/new/`, `/top/`, `/rising/`.

## Failure Signals

- Missing `shreddit-post` elements after navigation and wait timeout indicates a drift or block.
- Empty `subreddit-prefixed-name` or `post-title` on a post element indicates an ad or promoted unit; such entries are skipped.
- `INVALID_PARAM` is thrown for unsupported `sort` values or non-positive `limit`.

## Capture Assessment

This command should be captured. It reuses the proven extraction path from `reddit/get-hot`, generalizes the name to `get-feed`, adds the `best` sort option observed on the front page, and uses a more useful default limit of 20.
