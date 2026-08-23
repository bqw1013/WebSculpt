# Maintenance Context: substack/get-leaderboard

## Precipitation Background

This command was created to replace the leaderboard portion of the deprecated `substack/get-trending` command. The goal is a focused, reusable command for discovering top Substack authors/publications by category.

## Page Structure

The command does not rely on DOM selectors for primary data extraction. It navigates to `https://substack.com` to establish origin, then calls internal APIs:

- `GET /api/v1/categories?purpose=leaderboard` — returns category metadata.
- `GET /api/v1/category/leaderboard/{category_id}/{ranking}?page={n}` — returns ranked items.

DOM fallback (documented but not implemented): selector `main a` on `/leaderboard/{category}/{ranking}` pages, with text format `"rank\nauthor\npublication"`.

## Environment Dependencies

- Chrome or Edge with remote debugging enabled.
- WebSculpt daemon attaches via CDP; no new browser is launched.
- A Substack login session in the browser is required only for `--category for-you`.

## Failure Signals

- `BROWSER_ATTACH_REQUIRED`: remote debugging not enabled.
- `INVALID_PARAM`: unknown category slug or limit out of range.
- `EMPTY_RESULT`: API returned no items (e.g., `bestseller/paid`).
- `AUTH_REQUIRED`: expected for `for-you` without login.
- API response shape changes: missing `items`, `publication`, or `user` fields.

## Repair Clues

- If all categories start returning `EMPTY_RESULT`, verify the category list API still returns slugs and that `/api/v1/category/leaderboard/{id}/{ranking}` still exists.
- If only `for-you` fails, check login session.
- If category validation fails for a known slug, the categories API may have added/removed/replaced slugs.

## Value Assessment

The command provides stable, structured access to Substack leaderboards. The API is public (except For You), returns rich metadata, and supports pagination. The main risk is API drift or Cloudflare changes requiring DOM fallback re-implementation.

## Implementation Notes

- Browser-runtime command that fetches Substack leaderboard data from internal APIs.
- User-facing `new-bestsellers` maps to API category slug `bestseller` with ranking `trending`.
- User-facing `for-you` maps to API category slug `for-you` with ranking `paid`.
- All other slugs use ranking `paid`.
- API does not support `limit`; command aggregates pages internally.
- Category and bestseller rankings return 25 items per page and honor `page`.
- For You returns 50 items and ignores `page`.
- `bestseller/paid` returns 0 items; only `bestseller/trending` works.
- Direct `curl` to the API returns empty; a browser session is required.
- `freeSubscriberCount` and `rankingDetail` may be null for some publications.

## Last Verified

2026-08-03
