# Context

## Precipitation Background (Why This Command Exists)

Quora's `quora/search` command can discover topics but cannot fetch the contents of a specific topic page. Users need a reusable way to get the Read feed, top questions, and most-viewed writers for a given topic slug. This command was captured after live browser exploration of Quora topic pages.

## Value Assessment

- Reusable across any Quora topic slug.
- Covers three distinct content sections (Read, top_questions, writers) in one command.
- Saves repeated exploration and GraphQL reverse-engineering for topic pages.

## Page Structure

- Topic root: `https://www.quora.com/topic/<slug>`
- Tabs rendered as `[role="tab"]` DIVs with texts `Read`, `Answer`, `Most viewed writers`.
- Numeric topic ID (`tid`) is embedded in `window.ansFrontendGlobals.earlySettings.rootQueryVariables.tid` (and fallbacks).
- Read feed GraphQL: `TopicReadMultifeedLoggedIn_Query` then `MultifeedQuery(multifeedPage: "topic")`.
- Top questions GraphQL: `TopicWriteMultifeed_Query` then `MultifeedQuery(multifeedPage: "top_questions_in_topic")`.
- Writers: server-rendered text list at `/topic/<slug>/writers`, no observed GraphQL endpoint. Extracted by parsing the visible text pattern and matching names to `/profile/<name>` links.

## Environment Dependencies

- Requires Chrome or Edge with remote debugging enabled.
- A logged-in Quora session is recommended; anonymous access may encounter login walls.
- Cloudflare challenge requests are present but are normally handled by the attached browser.

## Failure Signals

- URL no longer contains `/topic/` after navigation.
- Body contains "Page Not Found".
- `window.ansFrontendGlobals` does not contain a numeric `tid`.
- GraphQL returns errors or an unexpected `multifeedConnection` schema.
- DOM selectors like `.puppeteer_test_question_title` no longer match cards.

## Repair Clues

- If `tid` path changes, search `window.ansFrontendGlobals` for numeric `tid` values.
- If GraphQL hashes change, re-capture them from browser network requests.
- If writers text format changes, update the regex that matches `views <name>[, credential] <answers> answers` and verify the `/profile/<name>` link mapping.
- If all else fails, the command can fall back to visible DOM extraction using selectors from `quora/search`.
