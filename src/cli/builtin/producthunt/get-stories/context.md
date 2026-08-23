# Context

## Precipitation Background (Why This Command Exists)

Product Hunt Stories is a distinct article-discovery surface from products, launches, and forums. The command gives downstream workflows compact article candidates without fetching single-story full text. It complements `get-product`, `get-best-products`, and the planned forum commands.

## Value Assessment

The verified main feed, category pages, and Search Stories control can be reused for recurring article discovery. Keeping category and query as separate mutually exclusive modes prevents callers from depending on an unverified combined URL or UI path.

## Page Structure

Main feed: `https://www.producthunt.com/stories`. Category feed: `/stories/category/<slug>`. Search input: `[data-test="stories-index-search-input"]`; submit text and press Enter, then extract only the nearest `More stories` header container so featured cards do not mask empty search results. Main SSR fields are `stories`, `storiesFeatured`; category SSR field is `storyCategory.stories`.

## Environment Dependencies

Browser runtime requires Chrome or Edge remote debugging and does not require Product Hunt login. The command uses a bounded 250–650ms post-load pause, one light mouse move or small reversible scroll, a 900–1300ms client-filter stabilization wait for query mode, and a final 0–2s pause. It does not loop, open extra tabs, or close the injected page. `limit` is local because page-number pagination was not verified.

## Failure Signals

Return `NOT_FOUND` for a 404 category response, `EMPTY_RESULT` for a valid query with no cards, and `DRIFT_DETECTED` when Apollo SSR data, the category connection, the search input, or the More stories container is missing. Invalid inputs fail before navigation with `INVALID_PARAM`.

## Repair Clues

If Apollo payload parsing drifts, inspect the current SSR transport and restore the `stories`/`storiesFeatured`/`storyCategory` paths before changing selectors. If Search Stories changes, re-verify its `data-test` attribute and the More stories container. Do not infer page-number pagination from the cursor alone.
