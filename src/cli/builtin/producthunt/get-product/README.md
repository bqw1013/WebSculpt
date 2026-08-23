# producthunt/get-product

## Description

Fetch one public Product Hunt product detail by its slug. The slug can be copied from `producthunt/search` or `producthunt/get-best-products`. The command is limited to the product itself; reviews, comments, launches as a list, and forum threads are separate concerns.

## Parameters

- `--slug <value>` (required): Product Hunt product slug, such as `linear` or `jupitrr`. Pass the slug only, not a full URL.
- `--detailed <value>` (optional, default `false`): pass `true` for publication metadata, images, makers, the latest launch, and awards in addition to the compact product record. Only `true` and `false` are accepted.

## Return Value

Default output contains:

```json
{
  "product": {
    "id": "111617",
    "slug": "linear",
    "name": "Linear",
    "tagline": "The product development system for teams and agents.",
    "description": "...",
    "url": "https://www.producthunt.com/products/linear",
    "websiteUrl": "https://linear.app",
    "logoUrl": "https://ph-files.imgix.net/...",
    "categories": [{ "id": "36", "name": "Project management software", "slug": "project-management" }],
    "stats": { "followersCount": 3064, "reviewsCount": 428, "rating": 4.92 },
    "status": { "isNoLongerOnline": false }
  },
  "sourceUrl": "https://www.producthunt.com/products/linear",
  "fetchedAt": "2026-07-30T00:00:00.000Z"
}
```

With `--detailed true`, the result also includes `details` with `publishedAt`, `updatedAt`, `imageUrl`, `screenshots`, `applicationCategory`, `operatingSystem`, `makers`, `latestLaunch`, and `awards` when Product Hunt provides them.

The command uses a short bounded page-ready pause, one light pointer/scroll interaction, and a final random pause of 0 to 2 seconds. This keeps request pacing courteous without adding a long fixed delay.

## Usage

```bash
websculpt producthunt get-product --slug linear
websculpt producthunt get-product --slug jupitrr --detailed true
```

## Common Error Codes

- `MISSING_PARAM`: `--slug` was omitted or empty.
- `INVALID_PARAM`: slug format or `--detailed` value is invalid.
- `NOT_FOUND`: Product Hunt returned a 404 product page.
- `DRIFT_DETECTED`: the page loaded but the expected Apollo product structure was not found.
- `EMPTY_RESULT`: a product page loaded without a usable product identity.
- `NAVIGATION_FAILED`: the product page could not be opened.
