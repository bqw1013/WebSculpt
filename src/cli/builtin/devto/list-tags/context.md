# Context

## Precipitation Background

DEV.to (Forem) has a public tag directory at `/tags`. The Forem API exposes `/api/tags`, but it does not support searching by name. This command captures both the API path and the rendered page path so callers can list tags reliably even when the API is temporarily unavailable.

## Value Assessment

DEV.to tags are a common entry point for content discovery. Reusing this command avoids manual API/page exploration and provides a stable output schema across both sources.

## Page Structure

- URL (browser, no query): `https://dev.to/tags`
- URL (browser, with query): `https://dev.to/tags?q=<query>`
- API: `GET https://dev.to/api/tags?per_page=<limit>`
- Card selector: `.js-tag-card.tag-card`
- Name inside card: `a.crayons-tag` text with `#` prefix removed
- Posts count inside card: `div.fs-xs.color-base-60`
- Summary inside card: `p.truncate-at-3`
- Background color: parsed from `--tag-prefix` in the `style` attribute of `a.crayons-tag`
- Empty result signal: page body contains "No results match"

## Environment Dependencies

- Requires a browser with remote debugging enabled.
- No login required.
- Browser commands execute in the local browser context via WebSculpt daemon.

## Failure Signals

- API returns non-2xx status or fetch throws.
- `.js-tag-card.tag-card` selector does not appear and the page does not show the empty-state text.
- Card inner structure changes so that name/count/summary/color selectors return nothing.

## Repair Clues

- If the API endpoint changes, verify `https://dev.to/api/tags` still returns the same JSON shape.
- If the page structure drifts, inspect the `/tags` page card HTML and update the selectors inside `extractTagsFromPage`.
- If the page adds a new empty-state message, add it to the empty detection check.
