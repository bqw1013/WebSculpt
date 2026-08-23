# Evidence: producthunt/get-stories

This document records the research and validation evidence for the `producthunt/get-stories` command.

## Exploration Path

The existing Product Hunt command library was checked with `websculpt command list producthunt`; it has no Stories listing command. `websculpt producthunt list-categories --help` and `websculpt producthunt get-best-products --help` were reviewed for neighboring command positioning. The `websculpt-explore` skill, the browser capture contract, and the capture skill were read before implementation.

A dedicated Playwright session named `$sessionName` attached successfully to Chrome. A self-owned tab was created and used for all Product Hunt navigation; the original user tabs were not navigated or closed.

## Verified URLs

- https://www.producthunt.com/stories
- https://www.producthunt.com/stories/category/makers
- https://www.producthunt.com/stories/category/makers?page=2
- https://www.producthunt.com/stories/category/not-a-real-story-category

## Structural Evidence

The all-stories page is titled `Stories | Product Hunt` and exposes the stable search selector `[data-test="stories-index-search-input"]` with placeholder `Search Stories`. Its Apollo SSR transport contains:

- `stories.edges`: 20 `AnthologiesStory` nodes.
- `stories.pageInfo`: `endCursor: "MjA"`, `hasNextPage: true`.
- `storiesFeatured.firstSection`: one story; `categorySection`: five stories.
- Story fields: `id`, `title`, `description`, `slug`, `headerImageUuid`, `minsToRead`, `category { name, slug }`, and author identity fields.

The category page title is `Makers | Product Hunt`; its SSR `storyCategory` object contains `name`, `description`, `slug`, and `stories`. The category connection has 10 edges and `pageInfo { endCursor: "MTA", hasNextPage: true }`. `?page=2` returned the same first slug and cursor, so page-number pagination is not treated as a verified upstream feature.

The Search Stories input is only present on `/stories`, not on category pages. Submitting `AI` keeps the URL at `/stories` and filters the `More stories` section in the DOM. The result container is located by finding the leaf element whose trimmed text is `More stories` and walking to its nearest `header`; story links inside it use `/stories/<slug>`, with nearby `/stories/category/<slug>` and author links. A nonsense query leaves that result container without story cards and without an explicit empty-state label.

## Failure Signals

The command requires Chrome or Edge with remote debugging enabled and does not require Product Hunt login. A 404 response for a category URL is reported as `NOT_FOUND`. Missing Apollo SSR transport/data, missing category connection, missing `Search Stories` input, or missing `More stories` container is reported as `DRIFT_DETECTED`. A query with no matching cards is reported as `EMPTY_RESULT`. Blank filters, malformed category slugs, invalid limits, invalid boolean values, and category-plus-query combinations are reported as `INVALID_PARAM`.

The source exposes `hasNextPage: true` and cursors, but no verified page-number URL or visible next-page control. The command reports that source pagination metadata without claiming that it can fetch later pages. `limit` is a local cap over the currently loaded source results.

## Capture Assessment

Capture is eligible and reusable as `producthunt/get-stories`: it provides compact discovery of featured, category, or client-side searched Stories while preserving stable IDs, slugs, URLs, category, author, and reading-time fields. Detailed mode adds source metadata and observed SSR/card fields without returning raw Apollo payloads. Category and query are mutually exclusive because the verified source UI does not expose a combined filter path.
