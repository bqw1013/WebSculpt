# Product Hunt Search Context

## Scope

This command implements only public Product Hunt search. It intentionally excludes product/detail pages, voting, reviews, comments, submission, following, collections, and other mutations.

## Precipitation Background

Product Hunt's current search page is server-rendered with Apollo rehydration data. The search connection is a reusable source because it includes stable IDs and native metadata without opening detail pages.

## Page Structure

Products render as spotlight result buttons with `data-test` IDs; numbered pagination is available through `?page=N`. The page also links to the launch and user search views. Apollo payload scripts may be removed after hydration, so extraction happens immediately after DOMContentLoaded.

## Environment Dependencies

The command requires WebSculpt's browser runtime attached to the user's existing Chrome or Edge session with remote debugging enabled. It uses only built-in page APIs and does not require an API key or a separately launched browser.

## Verified path

The verified search page is `https://www.producthunt.com/search?q=<query>`, with `https://www.producthunt.com/search/launches?q=<query>` and `https://www.producthunt.com/search/users?q=<query>` for the launch and user filters. Product search server data is embedded in an `ApolloSSRDataTransport` script under a `productSearch` connection; launches use `postSearch` with nested product nodes; users use `userSearch`. Each connection contains `edges[].node`, `pageInfo`, and `pagesCount`. The command parses that page data before hydration removes the script, preserves native nodes, then follows `?page=N` serially.

## Pacing and fallback

Product Hunt has previously presented Cloudflare/browser challenges in the existing `producthunt/get-trending` command. This command does not bypass challenges. It uses short randomized waits, reloads the exact search URL for DOM fallback after any page-data failure, waits for result selectors, and performs one small pointer/scroll nudge. A valid empty search connection is not considered drift.

## Failure Signals

Missing Apollo data, parse errors, navigation failures, non-record schema, and absent DOM selectors are treated as transport/schema failure. A valid empty connection is returned as empty. If both extraction paths fail, the command reports `DRIFT_DETECTED`; CAPTCHA, 403, and 429 are not bypassed.

## Maintenance notes

The Apollo transport script and `productSearch` key are implementation details, not a public API. If the script is removed or the connection is renamed, update `readApolloPage` after a fresh `websculpt-explore` trace. Keep native search nodes in output; do not open each product page to fill missing detail fields.

## Repair Clues

If Product Hunt changes card markup, first re-run explore on the same search URL and confirm the Apollo connection name and the `data-test` result selector. Keep page traversal serial and preserve the native node under `results[].native`.

## Value Assessment

The route is worth capturing because it is parameterized, public, and reusable across Product, Launch, and User search pages while retaining native search metadata.
