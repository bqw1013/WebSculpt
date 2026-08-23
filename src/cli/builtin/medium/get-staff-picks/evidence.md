# Evidence

## Verified URLs

- `https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f`
- `https://medium.com/_/graphql` (GraphQL endpoint used for lazy-loading)

## Structural Evidence

The Medium Staff Picks page is a public catalog/list page. The initial server-rendered HTML embeds `window.__APOLLO_STATE__` with the first 20 catalog items under the key path:

```
ROOT_QUERY["catalogById({\"catalogId\":\"c7bc6e1ee00f\"})"].__ref
  -> Catalog:c7bc6e1ee00f
  -> itemsConnection:(limit:20).items[0..19]
```

After the page hydrates, `window.__APOLLO_CLIENT__.cache.extract()` exposes the **live** Apollo cache. Scrolling toward the bottom of the list triggers `UserCatalogMainContentQuery` requests to `POST https://medium.com/_/graphql` with variables such as:

```json
{
  "catalogId": "c7bc6e1ee00f",
  "pagingOptions": { "limit": 20, "cursor": { "id": "offset:20" } }
}
```

Each successful batch is merged into the same live-cache key `Catalog:c7bc6e1ee00f.itemsConnection:(limit:20)`. Verified counts during exploration:

- Initial SSR/cache: 20 items
- After scrolling: 100 items (offsets 0-80 loaded)
- After further scrolling: 120 items
- `postItemsCount` on the catalog is 1,069, so the list is not exhausted at 100 items.

The connection's `paging.nextPageCursor` object indicates whether more items are available:

```json
{
  "paging": {
    "nextPageCursor": { "__ref": "CatalogPagingCursor:offset:100" }
  }
}
```

## Exploration Path

1. Imported existing `medium/get-staff-picks` command via `websculpt capture import`.
2. Read the command-family plan and browser runtime contract.
3. Created a dedicated explore workspace and attached a fresh Playwright CLI session to inspect the live page.
4. Compared `window.__APOLLO_STATE__` (static SSR snapshot, 20 items) against `window.__APOLLO_CLIENT__.cache.extract()` (live cache, grows on scroll).
5. Captured and inspected the lazy-load GraphQL request/response to confirm pagination uses `offset:N` cursors and batches of ~20 items.

## Failure Signals

- `APOLLO_STATE_NOT_FOUND`: neither `window.__APOLLO_CLIENT__` nor `window.__APOLLO_STATE__` is present; page architecture may have changed.
- `CATALOG_NOT_FOUND`: the Staff Picks catalog reference is missing from the cache.
- `ITEMS_NOT_FOUND`: the items connection has been renamed or removed.
- `PAGE_LOAD_FAILED`: navigation or hydration timed out.
- `EMPTY_RESULT`: no valid Post entities were found in the loaded items.
- `INVALID_PARAM`: `--limit` is not a positive integer between 1 and 100.

## Capture Assessment

The Staff Picks list page is a stable, public data source. The live Apollo cache reliably accumulates lazy-loaded items under `Catalog:c7bc6e1ee00f.itemsConnection:(limit:20)`. Reading from this cache preserves the rich metadata schema already used by the command and avoids fragile DOM parsing. The risk of structural drift is low because the command falls back to SSR `__APOLLO_STATE__` when the live client is unavailable, and the extraction logic only depends on the catalog ID and the `itemsConnection:(limit:20)` key, both of which are long-lived.

