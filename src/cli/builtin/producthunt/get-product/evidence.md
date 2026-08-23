# Evidence: producthunt/get-product

This document records the research and validation evidence for the `producthunt/get-product` command.

## Exploration Path

Checked `websculpt command list producthunt` and `--help` for `search`, `get-best-products`, and `list-categories`; no single-product detail command exists. Read the explore and capture skill references (the playwright CLI guide and the browser runtime contract). Used an explore session attached to the user's Chrome, then created and verified an owned tab before navigation. No login or write action was required.

## Verified URLs

- `https://www.producthunt.com/products/linear`
- `https://www.producthunt.com/products/jupitrr`
- `https://www.producthunt.com/products/this-product-does-not-exist-zzzz`

## Structural Evidence

Both valid product pages use the `/products/<slug>` route and expose a canonical `product` object through Apollo SSR transport scripts containing fields including:

- `id`, `slug`, `name`, `tagline`, `description`, `websiteUrl`, `cleanUrl`, `logoUuid`, `url`
- `categories[]` with `id`, `name`, `slug`, and `path`
- `followersCount`, `reviewsCount`, `reviewsRating`, `isNoLongerOnline`
- `latestLaunch` with launch `id`, `slug`, `name`, `createdAt`, `featuredAt`, `launchNumber`, `primaryLink`, and `productState`
- `awards.edges[].node` with badge position, period, date, and post/product identity
- `structuredData` with Schema.org product URL, `datePublished`, `dateModified`, `image`, `screenshot`, `aggregateRating`, `operatingSystem`, `applicationCategory`, and `author[]`

The page also renders review, forum, and launch-list content, but those are separate responsibilities and are not part of this command's output. The implementation should parse the script payload in page context and select the complete `data.product` object whose `id`, `slug`, `name`, and `tagline` are present, rather than relying on transient snapshot refs or a long CSS selector chain.

## Failure Signals

The browser runtime requires Chrome or Edge with remote debugging enabled; Product Hunt login was not required for the verified public pages. A missing required slug is a command parameter error. A browser-reported 404 or the page body/title containing `404` and `We seem to have lost this page` is `NOT_FOUND`. A non-404 page without a complete Apollo product object is `DRIFT_DETECTED`; a valid page with no product record is `EMPTY_RESULT`. Apollo payload parsing failure is also treated as drift. The command must not return raw Apollo or JSON-LD payloads, and must not include review bodies, comments, or forum threads.

## Capture Assessment

Capture eligible: yes. The slug-based `/products/<slug>` path was verified with two real products, the same stable Apollo product shape was observed across both, JSON-LD supplies useful supplemental fields, and a real 404 resource signal was verified. This is a reusable browser path that cleanly complements the existing search, category-ranking, and category-index commands.
