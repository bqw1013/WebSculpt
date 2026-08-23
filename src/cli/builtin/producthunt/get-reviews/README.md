# producthunt/get-reviews

Fetch the currently rendered product-level Reviews from a public Product Hunt product page.

## Description

The command navigates to `/products/{slug}/reviews`. Compact mode returns the product identity and the review cards currently rendered by Product Hunt. Detailed mode also returns review pros/cons tags, raw card text, and nested review-page comment/thread records.

## Parameters

- `--slug <value>` (required): Product Hunt product slug, for example `linear`.
- `--filter <value>` (optional, default `all`): verified values are `all`, `founder`, and `informative`.
- `--detailed <true|false>` (optional, default `false`): add extended review and nested comment fields.

The command does not expose `--page` or `--limit`: numbered controls were observed for Founder Reviews, but a stable page parameter was not captured in the verified contract.

## Return Value

Returns an object with:

- `sourceUrl`, `filter`, and `product` (`name`, `rating`, `reviewCount`)
- `reviews`: currently rendered review cards with `id`, `author`, optional build context, text, Helpful count, views, and age
- `count`: number of returned rendered cards
- `pagination`: observed pagination metadata and the current contract limitation
- detailed mode adds `pros`, `cons`, `rawText`, `comments`, and `threads`

## Usage

```
websculpt producthunt get-reviews --slug linear
websculpt producthunt get-reviews --slug linear --filter founder --detailed true
```

## Common Error Codes

- `MISSING_PARAM`: `--slug` was omitted.
- `INVALID_PARAM`: invalid product slug, filter, or detailed value.
- `NOT_FOUND`: Product Hunt could not find the product page.
- `EMPTY_RESULT`: the page loaded but rendered no review cards.
- `DRIFT_DETECTED`: expected Product Hunt Reviews structure was not found.
