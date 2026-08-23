# Context

## Precipitation Background (Why This Command Exists)

This command was approved after exploration verified that Product Hunt product Reviews are a distinct product-level data object. It is intentionally separate from launch comments and forum threads.

## Value Assessment

Given a Product Hunt product slug, callers can inspect current community reviews without repeating browser exploration. The same route and compact/detailed boundary apply across public products.

## Page Structure

Primary route: `https://www.producthunt.com/products/{slug}/reviews`.

Verified selectors and evidence:

- `[data-test="product-navigation-item-reviews"]` confirms the Reviews page.
- `[data-test]` values beginning with `detailed-review-` and ending with `-actionbar` identify rendered review cards.
- `data-test=comments-feed`, `thread-*`, and `comment-*` identify nested review-page discussion records.
- Verified filter query values are `filter=founder` and `filter=informative`; default All Reviews omits the query.

## Environment Dependencies

Requires the browser runtime and Chrome/Edge remote debugging. Product Hunt public pages were verified without login. The implementation uses a short 220-480 ms pause, one light mouse move, and a final random 0-2 second pause. It does not close the injected page.

## Failure Signals

If the Reviews navigation or product header is absent after navigation, the command returns `DRIFT_DETECTED` unless the page clearly reports not found. If no review cards are rendered on an otherwise valid Reviews page, it returns `EMPTY_RESULT`.

## Repair Clues

The product page's Reviews link is the verified entry point. Do not infer new filter values or page parameters from UI labels; re-run explore if Product Hunt changes the route or card markers. Nested review-page comments remain detailed-only because they are a separate object from the review card.
