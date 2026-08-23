# Maintenance Notes

## Overview

This command fetches Medium Staff Picks by reading the **live Apollo Client cache** from the public Staff Picks list page. It does not require authentication for the core dataset.

## Data Source

- **URL**: `https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f`
- **Data source**: `window.__APOLLO_CLIENT__.cache.extract()` (live Apollo cache), with a fallback to `window.__APOLLO_STATE__` if the live client is unavailable.
- **Key state path**: `Catalog:c7bc6e1ee00f → itemsConnection:(limit:20) → CatalogItemV2[] → Post`
- **GraphQL endpoint**: `POST https://medium.com/_/graphql` (`UserCatalogMainContentQuery`) is triggered automatically by the page when scrolling.

## 2026-08 Update: limit raised to 100

The command originally read only the static SSR snapshot (`window.__APOLLO_STATE__`), which contains exactly 20 items. To support `--limit` up to 100, the implementation now:

1. Reads the live Apollo Client cache, which grows as the page lazy-loads additional batches.
2. Scrolls the page in small increments when `limit > 20`, triggering the same GraphQL requests the UI uses.
3. Stops scrolling once the requested count is loaded, the list signals no next page, or progress stalls.
4. Returns `partial: true` (and `available`) when fewer than the requested number of items could be loaded.

Each scroll batch loads roughly 20 items. In practice, 100 items are reliably reachable after a few scrolls.

## Environment Notes

- **Browser**: Chrome/Edge with CDP remote debugging enabled
- **Login state**: Not required for public data; logged-in state may enrich the response
- **Stability**: Apollo cache extraction is more stable than DOM scraping because it does not rely on obfuscated CSS class names
- **Polite pacing**: Keep request frequency moderate. The command includes light randomized delays, small mouse movements, and smooth small scrolls.

## Failure Signals

- `APOLLO_STATE_NOT_FOUND`: Apollo cache is missing; page architecture may have changed.
- `CATALOG_NOT_FOUND`: The staff picks catalog reference is missing; catalog ID or page structure may have drifted.
- `ITEMS_NOT_FOUND`: The items connection is missing; the list may not have loaded.
- `EMPTY_RESULT`: No valid Post items were extracted; possible structure drift.
- `PAGE_LOAD_FAILED`: Navigation or hydration timed out; possible network issue or blocking.
- `INVALID_PARAM`: `--limit` is not a positive integer between 1 and 100.

## Repair Clues

- Inspect `window.__APOLLO_CLIENT__.cache.extract()` for the current `Catalog:c7bc6e1ee00f` object if the catalog reference changes.
- Inspect the Catalog object for the current items connection key pattern if `itemsConnection:(limit:20)` changes.
- If the page stops lazy-loading, verify that `Catalog:c7bc6e1ee00f.itemsConnection:(limit:20).paging.nextPageCursor` still exists and that scroll events still trigger `UserCatalogMainContentQuery`.
- As a fallback, navigate to `https://medium.com/` and look for the Staff Picks module in the homepage feed.
- Last-resort DOM fallback: articles are rendered in `div`s with obfuscated class names; look for `h2` title elements and nearby `a` tags for URLs.
- `previewImage` is an embedded object `{ __typename, id, focusPercentX, focusPercentY, alt }`, not a `__ref`. Build the URL as `https://miro.medium.com/v2/resize:fit:400/{id}`.
