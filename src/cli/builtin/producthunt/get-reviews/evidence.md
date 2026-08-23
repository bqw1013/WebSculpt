# Evidence: producthunt/get-reviews

This document records the research and validation evidence for the `producthunt/get-reviews` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

The source exploration passed the workspace assessment. The command library was checked with `websculpt command list producthunt` and adjacent help for `get-product`, `get-best-products`, `get-forum-threads`, and `search`. Before browser work, the browser runtime contract was read. Browser evidence was collected by attaching the user's Chrome session; no browser was launched with `open` or `launch`.

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

- https://www.producthunt.com/products/linear — title `Linear: The product development system for teams and agents. | Product Hunt`; verified the product slug and the Reviews route.
- https://www.producthunt.com/products/linear/reviews — title `Linear Reviews (2026) | Product Hunt`; verified product-level Reviews, summary, cards, nested comments, and filter controls.
- https://www.producthunt.com/products/linear/reviews?filter=founder — title `Linear Reviews (2026) | Product Hunt`; verified the Founder Reviews filter and numbered review pagination.
- https://www.producthunt.com/products/linear/reviews?filter=informative — title `Linear Reviews (2026) | Product Hunt`; verified the `Most Informative` sort state.

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

The stable parameterized route is `/products/{product-slug}/reviews`. On the product page, the Reviews link is `/products/linear/reviews` and displays `428 reviews`. On the Reviews page, the product header exposes product identity, rating, review count, follower count, and the navigation item `data-test=product-navigation-item-reviews`.

Review cards are rendered in the DOM and expose stable-looking identifiers such as `data-test=detailed-review-348498-actionbar`, `detailed-review-330894-actionbar`, and `detailed-review-587920-actionbar`. The card text includes reviewer name, a `used {product} to build {project}` context when present, reviewer review count, body text, `What's great` tags, `What needs improvement` tags, Helpful count, views, and relative age. Initial All Reviews render contained 13 review actionbars.

The page also contains a separate `data-test=comments-feed` with `data-test=thread-4930759` and `data-test=comment-4930759` nodes. These are nested comments/replies attached to reviews, not the review body. They are intentionally returned only in detailed mode so the compact result remains product-level Reviews.

The review filter menu has `data-test=dropdown-all`, `dropdown-founder`, and `dropdown-personal`, labelled All Reviews, Founder Reviews, and Other Reviews. The verified Founder Reviews URL is `?filter=founder`; it rendered 10 review cards and `First`, `Previous`, `1`, `2`, `3`, `Next`, `Last` controls. The verified informative state is `?filter=informative` with the page sort label `Most Informative`. No unverified filter values or page semantics are added.

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

- Missing or blank `slug` is a business `MISSING_PARAM` error.
- A slug that is not a Product Hunt slug is `INVALID_PARAM`; full URLs are not accepted as the slug.
- A Product Hunt 404 or missing Reviews content is `NOT_FOUND`.
- If the expected product header, Reviews navigation item, or review-card structure disappears, return `DRIFT_DETECTED` rather than silently returning an empty list.
- If the page is valid but no review cards are rendered, return `EMPTY_RESULT` with source URL and filter context.
- The command requires a browser with remote debugging and no Product Hunt login is required by the verified public pages.

## Capture Assessment

<!-- State whether this command should be captured and why. -->

Capture is appropriate because the Reviews route, product slug parameter, verified filter values, numbered pagination behavior, and compact/detailed object boundary were observed on real Product Hunt pages and verified in a live browser session. The command is intentionally separate from launch comments and forum-thread commands.
