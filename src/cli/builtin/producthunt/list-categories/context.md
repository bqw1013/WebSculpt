# Context

## Precipitation Background (Why This Command Exists)

Product Hunt commands already cover trending products and public search, but users need a reliable way to discover valid product-category filters before querying products. The original design considered `list-topics` or `list-categories`; exploration confirmed that Product Hunt presents Categories as the primary product taxonomy and Topics as separate launch tags, so this command is intentionally scoped to Categories.

## Value Assessment

This command turns a page that users would otherwise inspect manually into a reusable category-parameter lookup for `get-best-products`. The default output is intentionally compact: top-level and nested stable IDs, human-readable names, and URL-derived slugs, without descriptions or URLs. Detailed mode preserves the same hierarchy plus source metadata for inspection or future maintenance. Keeping Topics separate avoids mixing two different Product Hunt concepts.

## Page Structure

The command navigates to `https://www.producthunt.com/categories` and waits for the `h1` heading `Product Categories`. The primary extraction source is the inline script containing `ApolloSSRDataTransport`. Its rehydrated payload includes a `productCategories` `ProductCategoryConnection` with top-level `edges`, each node's `id`, `name`, `path`, and `subCategories.nodes`, plus `pageInfo.endCursor` and `pageInfo.hasNextPage`. Subcategory nodes provide `id`, `name`, `description`, and `path`.

The DOM fallback evidence is `h2` links for top-level categories and `h3` headings nested inside category anchors for subcategories, but the Apollo payload is preferred because it preserves IDs and hierarchy without relying on styling classes.

## Environment Dependencies

The browser runtime requires Chrome or Edge with remote debugging enabled. No Product Hunt login was needed. Raw HTTP requests were challenged by Cloudflare, so browser rendering is a required dependency. The command must not launch or close the browser; the WebSculpt daemon owns the injected page and its cleanup.
The command uses bounded courtesy pacing after the page is ready: one pointer move, a small reversible down/up scroll, and a final random 0–2 second pause before a successful return. It does not loop or perform repeated scrolling.

## Failure Signals

If the `detailed` parameter is present with any value other than `true` or `false`, throw `INVALID_PARAM`. If the page heading is not `Product Categories`, the Apollo SSR transport script is missing, its payload cannot be parsed, or the `productCategories` connection is absent, throw `DRIFT_DETECTED`. If the connection exists but has zero edges, throw `EMPTY_RESULT`. Preserve `hasNextPage` in compact mode and full `pageInfo` in detailed mode because `hasNextPage: true` means the returned snapshot is not proven complete.

## Repair Clues

First inspect the current `/categories` page and the Apollo SSR script before changing selectors. If the script marker changes, inspect the page's rehydration payload for a replacement `ProductCategoryConnection` field. If only the DOM remains available, use semantic `h1`/`h2`/`h3` structure and `/categories/` links, not Tailwind class names. Do not switch to raw curl as a workaround for Cloudflare; re-run browser exploration and record the new fields before modifying the command.
