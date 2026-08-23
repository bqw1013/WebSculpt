# producthunt/get-best-products

Fetch Product Hunt's current `Top reviewed` Best Products ranking for one category or subcategory slug. The slug should come from `producthunt/list-categories`; this command does not call that command internally and Categories remain separate from Topics.

## Usage

```bash
websculpt producthunt get-best-products --category productivity
websculpt producthunt get-best-products --category ai-meeting-notetakers --page 2 --limit 10
websculpt producthunt get-best-products --category productivity --detailed true
```

Parameters:

- `--category <slug>` is required and accepts a top-level or subcategory slug.
- `--page <number>` is optional, defaults to `1`, and selects the upstream 1-based page.
- `--limit <number>` is optional, defaults to `15`, and must be between `1` and `15`; Product Hunt currently returns 15 ranked products per page.
- `--detailed <true|false>` is optional and defaults to `false`.

The source page is a current/yearly snapshot headed `Top reviewed ... products`; no historical time-range parameter was verified. Browser remote debugging is required, but Product Hunt login is not.

## Return value

Compact mode returns `sourceUrl`, category identity, `ranking: "top-reviewed"`, yearly snapshot metadata, page metadata, and products with `rank`, `name`, `slug`, `url`, `tagline`, `rating`, and `reviewCount`.

Detailed mode adds product descriptions, publication/modification dates, images, operating-system/application-category, category links, makers, and retrieval time. Pagination still describes the upstream page and total result set; `limit` only trims the returned array.

Promoted cards are excluded so returned ranks preserve the Best Products list ordering. An invalid category, empty page, missing structure, or browser prerequisite failure is reported distinctly by the command/runtime.
