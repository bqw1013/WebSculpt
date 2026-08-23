# Evidence: producthunt/search

This document records the research and validation evidence for the `producthunt/search` command.

## Exploration Path

Host-machine `websculpt command list producthunt` returned no scoped commands. The existing unrelated `producthunt/get-trending` command was inspected for browser pacing only and was not modified. The websculpt-explore, websculpt-capture, and websculpt-maintain skills and the browser runtime contract were read before implementation. The browser automation tool attached to the user's existing Chrome `default` CDP session; a temporary Product Hunt tab was used without launching a browser.

## Verified URLs

- `https://www.producthunt.com/search?q=ai`
- `https://www.producthunt.com/search?q=ai&page=2` (numbered pagination target)
- `https://www.producthunt.com/search/launches?q=ai` (Launches tab target)
- `https://www.producthunt.com/search/users?q=ai` (Users tab target)

## Structural Evidence

At DOMContentLoaded, the Products search page contained inline scripts invoking `ApolloSSRDataTransport`. The rehydrated object had a `productSearch` connection with `edges[].node`, `pageInfo.page`, `pageInfo.hasNextPage`, `pageInfo.hasPreviousPage`, and `pagesCount`. An observed node preserved:

```json
{"__typename":"Product","id":"526014","name":"/ai","tagline":"Access ChatGPT anywhere you type '/ai'","slug":"ai-4","reviewsRating":5,"reviewsCount":2,"logoUuid":"e1d2a77c-afed-47b6-af24-133df1d4dbde.png","isNoLongerOnline":false}
```

The observed connection reported page 1, `hasNextPage: true`, and `pagesCount: 1000`; the visible page exposed links to pages 2, 3, and 1000. The page-data parser evaluates the same-origin object literal because the payload can contain JavaScript `undefined`, rather than assuming strict JSON. Native nodes are retained under `results[].native`.

The Launches tab uses a `postSearch` connection. Its nodes contain a launch/post `id`, `name`, `slug`, and `createdAt`, plus a nested `product` node with product ID, tagline, reviews, and logo UUID. The Users tab uses a `userSearch` connection with native `id`, `name`, `username`, `headline`, follower/following counts, and avatar URL. The command preserves these nested native structures and maps launch timestamps and user headlines when available.

Visible Product cards use `button[data-test="spotlight-result-product-<id>"]` and include an image, product name, tagline, and optional review text. The DOM fallback intentionally returns `partial:true`; unavailable maker/topic/vote/comment/publish fields are null rather than fabricated. The search page footer exposes Products, Launches, and Users navigation targets.

## Failure Signals

No CAPTCHA, 403, or 429 occurred during the verified Product Hunt page load. Product Hunt's existing trending command documents occasional Cloudflare challenges; this command does not bypass them. Missing Apollo scripts, parse errors, missing search connections, navigation failures, and missing expected page data trigger a fresh navigation to the exact search URL followed by selector-based DOM extraction. Valid empty Apollo connections are returned as empty results and do not trigger fallback. If both paths produce no records, the command throws `DRIFT_DETECTED`.

## Capture Assessment

`producthunt/search` is eligible for capture. It is parameterized by `query`, `limit`, `type`, `sort`, and `time`; enforces strict max limit 100; preserves native search nodes; follows numbered pages serially; reports unsupported standard filters through `ignoredParams`; uses short randomized waits and one small fallback pointer/scroll nudge; and stays within the requested search-only scope. It does not open details or perform Product Hunt mutations.

Windows host tests after final installation: Products `ai` limit 3 passed (`source: apolloSSR`); Products `ai` limit 25 passed across 3 pages with 25 records; Products with `sort=latest,time=month` passed and returned both values in `ignoredParams`; Launches `ai` limit 2 passed through `postSearch`; Users `ai` limit 2 passed through `userSearch`; malformed/over-limit/unknown-type checks returned `INVALID_PARAM`/`LIMIT_EXCEEDED` without browser navigation.
