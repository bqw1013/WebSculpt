# Evidence: medium/get-list

## Exploration Path

Consulted the WebSculpt command library (`websculpt command list medium`) and confirmed no existing command accepts an arbitrary Medium list URL. Existing `medium/get-staff-picks` is a hard-coded specialization of the same page type.

Followed the browser automation access protocol. Used an independent `@playwright/cli` session attached to the user's Chrome. All page access was performed in a single tab reused via `goto`; the tab was closed and the session detached at the end of exploration.

Data extraction strategy (verified live):

1. Load the list page with `waitUntil: "domcontentloaded"` and wait for Apollo state hydration.
2. Extract the `listId` from the URL path (`/@<user>/list/<slug>-<listId>`).
3. Read list metadata from `Catalog:<listId>` in `window.__APOLLO_STATE__` (or the live Apollo Client cache if the page has re-fetched).
4. If `limit > 20`, scroll smoothly toward the bottom of the page to trigger `/_/graphql` lazy-load batches; re-read the live Apollo cache after each batch until enough items are loaded, the list is exhausted, or progress stalls.
5. Resolve each `CatalogItemV2` to its referenced `Post`, then resolve the `Post`'s creator, tags, and preview image.
6. Return list metadata plus article cards.

The live cache consistently contains all loaded items under the same `Catalog:<listId>` key, so a single cache read after scrolling covers both the SSR batch and the lazy-loaded batches. No direct GraphQL calls are required.

## Verified URLs

- `https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f` — large public list (1069 items), used as the primary verification target. Initial 20 items, scroll grew loaded count 20 → 40 with further pages available.
- `https://medium.com/@MediumStaff/lists` — author's lists tab; confirmed canonical list URL shape and discovered additional public lists.
- `https://medium.com/@MediumStaff/list/investing-in-our-publication-ecosystem-ff72cca326e8` — smaller public list (6 items), confirmed the same `Catalog` structure and verified list-exhausted state (`hasNext = false`).

## Structural Evidence

### URL pattern

```text
https://medium.com/@<user>/list/<slug>-<listId>
```

The 12-character hex suffix at the end of the last path segment is the `listId` (e.g. `c7bc6e1ee00f`). Query parameters such as `?source=user_lists...` are ignored during parsing.

### List metadata in Apollo state

```json
{
  "ROOT_QUERY": {
    "catalogById({\"catalogId\":\"c7bc6e1ee00f\"})": {
      "__ref": "Catalog:c7bc6e1ee00f"
    }
  },
  "Catalog:c7bc6e1ee00f": {
    "id": "c7bc6e1ee00f",
    "__typename": "Catalog",
    "name": "Staff picks",
    "description": "Stories from across Medium, hand-selected by our team.",
    "type": "LISTS",
    "visibility": "PUBLIC",
    "postItemsCount": 1069,
    "responsesCount": 197,
    "clapCount": 19153,
    "clappersCount": 2238,
    "creator": { "__ref": "User:a32c340ea342" },
    "thumbnailImage": "0*8d3322ce92c251e8fe1332509950df6f405f606f.jpeg",
    "createdAt": 1649459921501,
    "itemsLastInsertedAt": 1786015990487,
    "itemsConnection:(limit:20)": {
      "items": [ /* CatalogItemV2 refs */ ],
      "paging": {
        "count": 1069,
        "nextPageCursor": { "__ref": "CatalogPagingCursor:offset:20" }
      }
    }
  }
}
```

Curator info is read from the referenced `User:<id>` node (`name`, `username`).

### List item (CatalogItemV2)

```json
{
  "__typename": "CatalogItemV2",
  "catalogItemId": "6a7470f6829a1bef3aae034c",
  "entityType": "POST",
  "entity": { "__ref": "Post:233d8b9b2fa3" },
  "catalogId": "c7bc6e1ee00f",
  "userAnnotation": {
    "__typename": "CatalogItemAnnotation",
    "annotation": "I love obscure histories! Go find a spurtle to stir your next pot of oatmeal with.\n— Claud @ Medium"
  }
}
```

`userAnnotation.annotation` is optional and may be missing for lists without curator notes.

### Article entity (Apollo state)

Each `CatalogItemV2` points to a `Post` node with full metadata:

```json
{
  "__typename": "Post",
  "id": "233d8b9b2fa3",
  "title": "\"Stir Clockwise Lest You Invoke the Devil\"",
  "mediumUrl": "https://medium.tastyble.com/stir-clockwise-lest-you-invoke-the-devil-233d8b9b2fa3",
  "extendedPreviewContent": {
    "__typename": "PreviewContent",
    "subtitle": "The history of making and storing oatmeal porridge in Scotland",
    "isFullContent": false
  },
  "firstPublishedAt": 1785509161521,
  "latestPublishedAt": 1786064845462,
  "readingTime": 13.05377358490566,
  "clapCount": 828,
  "isLocked": true,
  "postResponses": { "__typename": "PostResponses", "count": 11 },
  "previewImage": { "__typename": "ImageMetadata", "id": "1*9iJiZCueNyCCAEKbYYhG7g.jpeg" },
  "creator": { "__ref": "User:6d659da2b625" },
  "tags": [ { "__ref": "Tag:food" }, { "__ref": "Tag:history" }, ... ]
}
```

### Lazy loading

Verified scroll sequence on Staff Picks:

```text
initial: 20, hasNext: true
after 1st scroll: 20, hasNext: true  (request in flight)
after 2nd scroll: 40, hasNext: true
after 3rd scroll: 40, hasNext: true  (request in flight)
```

Each successful batch adds ~20 items. The command waits for cache growth and tolerates one in-flight round.

## Failure Signals

- `MISSING_PARAM` / `INVALID_PARAM`: before page load if `url` is missing or does not match `/@<user>/list/<slug>-<listId>`, or `limit` is outside 1–100.
- `NOT_FOUND`: the Apollo catalog node is `NotFound`, missing, or the page body contains `PAGE NOT FOUND`.
- `PAGE_LOAD_FAILED`: `window.__APOLLO_STATE__` / Apollo Client cache does not hydrate within the timeout.
- `EMPTY_RESULT`: no valid article items could be extracted after loading.
- `DRIFT_DETECTED`: expected `Catalog:<listId>` or `itemsConnection` structure is absent after load.

## Capture Assessment

The path is stable and reproducible: load a public list URL, read Apollo metadata, scroll to load more items into the live Apollo cache, then resolve items from the cache. It requires no login, is parameterizable by URL and limit, and fits the existing `browser` runtime. The command should be captured as `medium/get-list`.
