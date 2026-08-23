# Evidence: producthunt/get-best-products

This document records the research and validation evidence for the `producthunt/get-best-products` command.

## Exploration Path

Checked `websculpt command list producthunt` and `websculpt producthunt list-categories --help`; no existing Best Products command exists, and category/subcategory slugs are the intended input vocabulary. Read the browser runtime contract and attached the user's Chrome session.

## Verified URLs

- https://www.producthunt.com/best-products (HTTP 404)
- https://www.producthunt.com/categories
- https://www.producthunt.com/categories/productivity
- https://www.producthunt.com/categories/productivity?page=2#content
- https://www.producthunt.com/categories/ai-meeting-notetakers

## Structural Evidence

The real entry point is `/categories/<slug>`. The category index exposes Apollo SSR `productCategories` with 20 first-page edges, `endCursor="MjA"`, and `hasNextPage=true`; its nodes contain top-level and nested category `id`, `name`, `path`, and slug-equivalent paths.

Category pages expose `section#content` and a JSON-LD `CollectionPage` whose `mainEntity` is an `ItemList` of 15 products. The page uses `?page=N#content`; Productivity page 1 reported `Showing 1-15 of 9269 products`, page 2 reported `Showing 16-30 of 9269 products`, and the last link was page 618. The list has one promoted card plus 15 ranked product cards; promoted cards have an image with `alt="Promoted"` and are excluded.

Each JSON-LD product item provides `position`, `name`, `url`/`@id`, `description`, `datePublished`, `dateModified`, `image`, and `aggregateRating`. DOM cards provide the visible tagline, review count, category links, and `data-test="product:<slug>"`. The page heading is `Top reviewed <category> products`; no verified time-range selector exists. A subcategory URL `/categories/ai-meeting-notetakers` returned 147 products and the same 15-item structure.

## Failure Signals

`/best-products` is a known 404 and must not be used. A missing/changed `section#content`, CollectionPage JSON-LD, ItemList, pagination summary, or product URL/name is `DRIFT_DETECTED`. A valid page with zero ItemList products is `EMPTY_RESULT`. A category route that renders a not-found title is `NOT_FOUND`. Browser attach failures are runtime prerequisites. Product Hunt may insert promoted cards; the extractor excludes them. The source is a current/yearly snapshot, not a historical time-range API.

## Capture Assessment

Capture is eligible and recommended: the category slug, page query, 15-item JSON-LD list, stable product URL/slug fields, pagination summary, and compact/detailed output are repeatable across both a top-level category and a subcategory.
