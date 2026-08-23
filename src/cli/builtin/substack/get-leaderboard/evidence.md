# Evidence: substack/get-leaderboard

This document records the research and validation evidence for the `substack/get-leaderboard` command.

## Exploration Path

- Checked existing WebSculpt commands in the `substack` domain: `substack/get-trending`, `substack/get-trending-topics`, and `substack/search`. No existing `substack/get-leaderboard` command was found.
- Read the WebSculpt browser runtime guide before using browser automation.
- Read the browser runtime contract before editing `command.js`.
- Explored leaderboard pages and network traffic using `playwright-cli` attached to the user's Chrome instance.

## Verified URLs

- `https://substack.com/leaderboard` — landing page, no ranked list rendered directly.
- `https://substack.com/leaderboard/bestseller/rising` — New Bestsellers global leaderboard.
- `https://substack.com/leaderboard/bestseller/paid` — global paid view returns 0 items.
- `https://substack.com/leaderboard/technology/paid` — Technology category Top Bestsellers.
- `https://substack.com/leaderboard/technology/rising` — Technology category Rising.
- `https://substack.com/leaderboard/business/paid` — Business category Top Bestsellers.
- `https://substack.com/leaderboard/for-you` — personalized For You leaderboard (requires login).

## Structural Evidence

### Category list API

`GET https://substack.com/api/v1/categories?purpose=leaderboard`

Response: array of category objects with fields:
- `id`: numeric ID or `"for-you"`
- `name`: display name
- `slug`: URL-safe identifier used for leaderboard routing

Verified 34 categories including `for-you`, `culture`, `technology`, `business`, `finance`, `world-politics`, `news`, `science`, `philosophy`, `history`, `us-politics`, `food`, `podcast`, `sports`, `art`, `health-politics`, `fashionandbeauty`, `music`, `faith`, `climate`, `literature`, `fiction`, `health`, `design`, `travel`, `parenting`, `comics`, `international`, `crypto`, `humor`, `education`, `film-and-tv`, `home-garden`, `bestseller`.

### Leaderboard API

`GET https://substack.com/api/v1/category/leaderboard/{category_id}/{ranking}?page={n}`

Verified endpoints:
- `/api/v1/category/leaderboard/4/paid?page=0` — Technology Top Bestsellers, 25 items.
- `/api/v1/category/leaderboard/4/paid?page=1` — next 25 items.
- `/api/v1/category/leaderboard/4/paid?page=2` — next 25 items.
- `/api/v1/category/leaderboard/4/paid?page=3` — next 25 items.
- `/api/v1/category/leaderboard/4/paid?page=4` — 0 items (end of list).
- `/api/v1/category/leaderboard/62/paid?page=0` — Business Top Bestsellers.
- `/api/v1/category/leaderboard/bestseller/trending?page=0` — New Bestsellers, 25 items.
- `/api/v1/category/leaderboard/bestseller/trending?page=1/2/3` — additional 25 items each.
- `/api/v1/category/leaderboard/bestseller/trending?page=4` — 0 items.
- `/api/v1/category/leaderboard/bestseller/paid?page=0` — 0 items.
- `/api/v1/category/leaderboard/for-you/paid?page=0` — 50 items.
- `/api/v1/category/leaderboard/for-you/paid?page=1/2` — same 50 items (page ignored for For You).

### Response item shape

Each item contains:
- `user.name` — author display name.
- `user.handle` — author handle (`@handle`).
- `user.photo_url` — avatar URL.
- `publication.name` — publication name.
- `publication.subdomain` — Substack subdomain.
- `publication.base_url` — canonical publication URL.
- `publication.rankingDetail` — subscriber description text.
- `publication.freeSubscriberCount` — free subscriber count string like `"306,000"`.

### Pagination behavior

- `limit` query parameter is not supported; all requests return fixed page sizes.
- Category and bestseller rankings return 25 items per page and honor `page`.
- For You returns 50 items and ignores `page`.
- Technology paid has 100 total items (pages 0-3).
- Bestseller rising has 100 total items (pages 0-3).

### DOM fallback

If the API fails, the rendered list can be scraped with selector `main a`. Each link text is formatted as `"rank\nauthor\npublication"`. This fallback is less stable and lacks subscriber counts and avatar URLs.

## Failure Signals

- `BROWSER_ATTACH_REQUIRED` — Chrome remote debugging not enabled.
- Empty `items` array — valid response but no data (e.g., `bestseller/paid`).
- `for-you` without login — expected to require authentication; command should return `AUTH_REQUIRED`.
- Cloudflare/session blocking — direct `curl` to the API returns empty, confirming browser session is required.
- Unknown category slug — return `INVALID_PARAM` with the list of valid slugs.

## Capture Assessment

This command should be captured. The leaderboard data is available through a stable internal API that was verified across multiple categories and ranking types. The API response is well-structured and provides all fields required by the output schema. Browser runtime is required because direct HTTP requests are blocked by the platform's session checks. A DOM fallback is documented but the primary implementation should use the API.
