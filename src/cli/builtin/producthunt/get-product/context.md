# Context

## Precipitation Background (Why This Command Exists)

Product Hunt has separate commands for discovering products (`search`, `get-best-products`, and `get-trending`). Callers need a reusable detail command after they have a product slug. The detail command must stay focused on the product record and avoid absorbing review, comment, launch-list, or forum-thread responsibilities.

## Value Assessment

The `/products/<slug>` route is directly reusable from existing Product Hunt list and search output. A single browser extraction path avoids repeating page exploration and provides stable identity, categories, website URL, and interaction counts for downstream workflows. The compact default keeps normal calls inexpensive; detailed metadata is opt-in.

## Page Structure

- Product URL: `https://www.producthunt.com/products/<slug>`.
- Valid pages expose an `h1` heading and Apollo SSR transport scripts containing a `rehydrate` map with a complete `data.product` object.
- The primary product object includes `id`, `slug`, `name`, `tagline`, `description`, `websiteUrl`, `categories`, `followersCount`, `reviewsCount`, `reviewsRating`, `logoUuid`, `url`, `latestLaunch`, `awards`, and `structuredData`.
- `structuredData` and JSON-LD provide `datePublished`, `dateModified`, image/screenshot URLs, aggregate rating, application category, operating system, and maker profiles.
- A 404 product route reports HTTP 404 and renders a body containing `404` and `We seem to have lost this page`.

## Environment Dependencies

The command uses the browser runtime and requires Chrome or Edge with remote debugging enabled. Product Hunt login is not required for the verified public pages. It uses `domcontentloaded`, waits for `h1`, then performs a bounded 200–600ms page-ready pause, one light pointer movement and small reversible scroll, and a final random 0–2000ms pause before success. It does not loop, open additional tabs, or close the injected page.

## Failure Signals

- Empty `slug` or a slug containing a full URL: `MISSING_PARAM` or `INVALID_PARAM`.
- `--detailed` other than `true` or `false`: `INVALID_PARAM`.
- Browser response status 404 or the known missing-page body: `NOT_FOUND`.
- Missing Apollo transport payload, malformed payload, or missing complete product identity: `DRIFT_DETECTED`.
- A successful page with no usable id/slug after extraction: `EMPTY_RESULT`.
- `page.goto` failure: `NAVIGATION_FAILED`.

## Repair Clues

1. Keep `/products/<slug>` as the first entry point; do not infer a product from category or forum pages.
2. If Apollo transport changes, inspect the current `ApolloSSRDataTransport` scripts and preserve the invariant of selecting `data.product` with `id`, `slug`, `name`, and `tagline`.
3. If JSON-LD changes, keep the Apollo core output and make only detailed supplemental fields nullable.
4. Preserve the distinction between the product's `latestLaunch` summary and the separate launch list command.
5. If 404 rendering changes, use the browser response status first and update the page-level missing-resource signal second.
