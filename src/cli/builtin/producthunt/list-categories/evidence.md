# Evidence: producthunt/list-categories

This document records the research and validation evidence for the `producthunt/list-categories` command.

## Exploration Path

The Product Hunt command library was checked with `websculpt command list producthunt`. Existing `producthunt/get-trending` and `producthunt/search` do not provide a category directory, so this is a new command.

The exploration followed the `websculpt-explore` skill and its browser automation guide. Browser verification used a Playwright CLI session `<session>` with one self-owned tab. The capture browser runtime contract was consulted.

## Verified URLs

- https://www.producthunt.com/categories
- https://www.producthunt.com/topics
- https://www.producthunt.com/stories/announcing-product-categories
- https://api-v2-docs.producthunt.com/query/topics/

## Structural Evidence

For `https://www.producthunt.com/categories`:

- The document title is `Categories` and the main heading is `Product Categories`.
- The page embeds an Apollo SSR transport script whose payload contains `productCategories` with `__typename: ProductCategoryConnection`, `edges`, and `pageInfo`.
- Each top-level edge node contains `id`, `name`, `path`, and `subCategories.nodes`.
- Each subcategory node contains `id`, `name`, `description`, and `path`.
- The verified first page has 20 top-level edges. `pageInfo` returned `endCursor: "MjA"` and `hasNextPage: true`, so the command must expose pagination metadata and must not claim the result is a complete historical taxonomy.
- Verified samples include `Productivity` (`id: 34`, `/categories/productivity`) with 34 subcategories, `AI notetakers` (`id: 1288`, `/categories/ai-meeting-notetakers`), and `AI Presentation Software` (`id: 1848`, `/categories/ai-presentation-software`).

Implementation path:

1. Navigate the injected browser page to `https://www.producthunt.com/categories` with `waitUntil: "domcontentloaded"`.
2. Wait for the `h1` heading and the Apollo SSR script marker.
3. Extract and evaluate the inline Apollo transport payload, locate the rehydrated entry whose data contains `productCategories`, and map the connection into serializable command output.
4. Convert each relative `path` to an absolute Product Hunt URL and return the connection cursor metadata.

The `/topics` page was also verified as a separate `topics` `TopicConnection` with 20 edges and `hasNextPage: true`; it is labeled `Launch tags` and is intentionally not merged into this category command.

## Failure Signals

`browser` runtime requires Chrome or Edge with remote debugging enabled; no Product Hunt login was required during verification. Raw HTTP requests returned a Cloudflare `Just a moment...` challenge, so the command must use browser rendering.

Throw `[DRIFT_DETECTED]` when the category heading, Apollo SSR script, rehydrated `productCategories` connection, or expected `edges` structure is missing. Treat an empty edge list as `EMPTY_RESULT` only when the connection exists and the page loaded normally. Surface the returned `pageInfo` so callers can distinguish a first-page snapshot from a complete directory.

## Capture Assessment

Capture is approved. `producthunt/list-categories` is a reusable browser command for discovering Product Hunt category parameters before using `get-best-products`. Its default output is a compact hierarchy of stable IDs, names, and URL-derived slugs; detailed mode preserves the same hierarchy plus absolute URLs, descriptions, and the source cursor. It explicitly reports that the source page is paginated.
