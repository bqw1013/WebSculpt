# producthunt/list-categories

Generated draft for a `browser` runtime command.

## Description

Lists Product Hunt category options for use with `get-best-products`. The
default result is intentionally compact so callers can choose a category
parameter without carrying the full taxonomy metadata. It still includes
compact subcategory options under each top-level category. Use detailed mode
when descriptions, URLs, or source metadata are needed.

## Parameters

- `--detailed` (optional, default `false`): Pass `true` to include nested
  subcategories, descriptions, absolute URLs, retrieval time, and full
  pagination metadata. Only `true` and `false` are accepted.

Product Hunt login is not required. The command requires Chrome or Edge with
remote debugging enabled.

## Return Value

By default, the command returns:

```json
{
  "categories": [
    {
      "id": 34,
      "name": "Productivity",
      "slug": "productivity",
      "subCategories": [
        { "id": 1288, "name": "AI notetakers", "slug": "ai-meeting-notetakers" }
      ]
    }
  ],
  "count": 20,
  "hasNextPage": true
}
```

With `--detailed true`, it returns:

- `sourceUrl`: `https://www.producthunt.com/categories`
- `fetchedAt`: ISO timestamp for the retrieval
- `categories`: first-page top-level categories, each with `id`, `name`, `slug`, and `subCategories`
- Default `subCategories`: compact nested entries with only `id`, `name`, and `slug`
- `subCategories`: nested entries with `id`, `name`, `slug`, `description`, and `url`
- `pageInfo`: `{ endCursor, hasNextPage }` from Product Hunt's category connection
- `count`: number of top-level categories returned

The default `slug` is the value intended to be passed to a future
`get-best-products` category parameter. `hasNextPage` must be checked before
treating the result as a complete directory. The command intentionally reports
the page returned by Product Hunt rather than silently fetching or inventing
unverified pagination behavior.

## Usage

```
websculpt producthunt list-categories
websculpt producthunt list-categories --detailed true
```

The browser interaction includes one short, bounded courtesy pause, a small
pointer movement, and a reversible down/up scroll. A final random pause of
0–2 seconds is applied before a successful response is returned.

## Common Error Codes

- `DRIFT_DETECTED`: Product Hunt's heading, Apollo SSR transport, or `productCategories` connection changed or was not available.
- `EMPTY_RESULT`: The category connection loaded successfully but contained no top-level categories.
- `INVALID_PARAM`: `--detailed` was not `true` or `false`.
- `BROWSER_ATTACH_REQUIRED`: Chrome or Edge remote debugging is not available to WebSculpt.
