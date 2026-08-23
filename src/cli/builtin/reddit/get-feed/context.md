# Context

## Precipitation Background (Why This Command Exists)

The existing `reddit/get-hot` command fetches the Reddit front-page feed, but its name suggests only "hot" sorting. The front page actually supports `best`, `hot`, `top`, `rising`, and `new`. This command renames/generalizes the capability to `reddit/get-feed` and adds `best` as the new default sort.

## Value Assessment

`get-feed` better describes the command's actual behavior. The `best` sort is Reddit's default front-page algorithm, so making it the default provides more relevant results out of the box. The command remains reusable for any front-page feed analysis.

## Page Structure

- URL pattern: `https://www.reddit.com/{sort}/` where `{sort}` is one of `best`, `hot`, `top`, `rising`, `new`.
- Posts are `<shreddit-post>` custom elements.
- Key attributes: `subreddit-prefixed-name`, `post-title`, `score`, `comment-count`, `permalink`, `content-href`, `author`.
- Lazy loading: additional `<shreddit-post>` elements are rendered as the user scrolls. The command scrolls incrementally and stops when the requested `limit` is reached or when the visible post count stops growing for 3 consecutive rounds (indicating end of feed).

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled.
- Public feed access does not require Reddit login.
- Browser automation can be rate-limited or challenged by Reddit.

## Failure Signals

- `shreddit-post` selector missing → `DRIFT_DETECTED` or `TIMEOUT`.
- Posts with empty title or subreddit are treated as ads/promoted and skipped.

## Repair Clues

- If Reddit changes `shreddit-post` structure, verify the same attributes still exist via browser devtools.
- If a sort tab is removed, remove it from `validSorts` and update the default accordingly.
