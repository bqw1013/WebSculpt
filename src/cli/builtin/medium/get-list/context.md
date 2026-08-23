# Context

## Precipitation Background

Medium lists are public curation collections. The official `medium/get-staff-picks` command already proved that list data can be read from the page's Apollo state, but it is hard-coded to the Medium Staff list. Users need the same capability for any public list URL.

## Value Assessment

This command generalizes a verified path. It saves repeated manual exploration for any Medium list and enables downstream workflows such as "fetch a curated reading list" or "monitor a competitor's public bookmarks".

## Page Structure

- URL pattern: `https://medium.com/@<user>/list/<slug>-<listId>`.
- The 12-character hex suffix at the end of the last path segment is the internal `listId`.
- Apollo cache key: `Catalog:<listId>`.
- Items are stored as `CatalogItemV2:{"catalogItemId":"..."}` nodes, each pointing to a `Post:<postId>`.
- Curator info is in the referenced `User:<id>` node.
- The first ~20 items come from SSR; subsequent batches are loaded into the live Apollo cache via `/_/graphql` as the page is scrolled.

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled.
- No Medium login required.
- Member-only posts are returned with `isMemberOnly: true` and limited to their public preview metadata.

## Polite Pacing

- Use the browser's real user session and cookies.
- Random short waits and small mouse moves after page load.
- Smooth, randomized scrolls to trigger lazy loading.
- Final randomized pause before returning.

## Failure Signals

- `INVALID_PARAM`: URL does not match the expected pattern or `limit` is out of range.
- `NOT_FOUND`: page body contains `PAGE NOT FOUND` or Apollo returns `NotFound` for the catalog.
- `PAGE_LOAD_FAILED`: Apollo Client cache / `window.__APOLLO_STATE__` does not appear within 15s.
- `DRIFT_DETECTED`: `Catalog:<listId>` or `itemsConnection:(limit:20)` is missing after load.
- `EMPTY_RESULT`: no resolvable `Post` entities after loading.

## Repair Clues

- If the Apollo cache key changes (e.g. from `Catalog:` to `List:`), update `catalogKey` and `rootKey` in both `getCacheStatus` and the extraction block.
- If the items connection field name changes (e.g. `itemsConnection:(limit:20)`), update that key everywhere.
- If Medium stops SSR-hydrating the full list, switch to parsing `article[data-testid="post-preview"]` DOM cards as a fallback, similar to earlier draft explorations.
