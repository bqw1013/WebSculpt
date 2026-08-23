# Context: producthunt/get-best-products

## Purpose

This command is the product-result counterpart to `producthunt/list-categories`. It retrieves the current Product Hunt Best Products ranking under a caller-provided category or subcategory slug. It must not invoke `list-categories` internally.

## Source behavior

The valid page family is `https://www.producthunt.com/categories/<slug>`, not `/best-products` (that path returned HTTP 404). Category pages are titled `The best ... tools to try/use in 2026`, expose a `Top reviewed` ranking, and use `?page=N#content`. The upstream page contains 15 ranked products plus occasional promoted cards. JSON-LD `CollectionPage.mainEntity.itemListElement` is the primary structured source; the `section#content` card list supplies visible taglines, review counts, category links, and promoted-card detection.

The source currently exposes a yearly/current snapshot (`Last updated`, `Products considered`) but no verified time-range selector. Do not add a date/year parameter without renewed exploration.

## Extraction and output

The command waits for `section#content` and JSON-LD, parses the 15 non-promoted JSON-LD products, merges stable card fields, and returns compact or detailed serializable data. Numeric IDs are not present in this page-level source; stable product URL and slug are retained. `pageInfo` reports page, page size, total count, total pages, and next-page state. `limit` is a bounded client-side trim from 1 to 15.

## Failure and repair clues

Use `NOT_FOUND` for a category route that renders a not-found page, `EMPTY_RESULT` for a valid page with no products, and `DRIFT_DETECTED` when section/JSON-LD/pagination/product structure is missing. Runtime-level browser attach failures remain outside command logic. If Product Hunt changes its page structure, re-explore the category page and update the JSON-LD/card extraction together.

## Courtesy pacing

The command uses one short bounded post-load pause, one small pointer movement, and a final random 0-2 second pause. This is courtesy pacing only; it intentionally avoids repeated scrolling or long delays.
