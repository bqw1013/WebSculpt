# Context

## Precipitation Background

`quora/get-space` was created to let users read a specific Quora Space (community) by its subdomain. While `quora/search` can discover Spaces, it cannot fetch the Space feed, questions, about text, or contributor list.

## Value Assessment

- Reusable for any public Quora Space.
- Supports four common views in a single command interface.
- Output carries stable URLs and author profile URLs that can feed into other commands (e.g., `quora/get-profile`, `quora/get-answer`).

## Page Structure

- Base URL: `https://<space>.quora.com/`
- Tabs are query parameters, **not** path segments:
  - Posts Recent: `?sort=recent`
  - Questions: `?questions`
  - About / Contributors: `?about`
- Stable selectors discovered in explore:
  - `.puppeteer_test_tribe_name` — Space name
  - `.puppeteer_test_tribe_info_header` — description, counts, activity summary
  - `.puppeteer_test_tribe_tab_main` / `_questions` / `_about` — tabs
  - `.puppeteer_test_tribe_post_item_feed_story` — post cards
  - `.puppeteer_test_tribe_answer_feed_story` — answer cards
  - `.puppeteer_test_question_component_base` / `_title` — question cards
- GraphQL feed operation: `MultifeedQuery` (`/graphql/gql_para_POST?q=MultifeedQuery`). Implementation uses DOM extraction instead of replaying GraphQL.

## Environment Dependencies

- Requires a logged-in Quora session in the attached browser; anonymous access may hit login walls or incomplete content.
- Rate limiting: Cloudflare challenges appear in network traffic. The command adds random waits, mouse moves, and small scrolls between actions.

## Failure Signals

- Unknown Space → redirect to `https://www.quora.com/`.
- `/<space>/questions` (path) → 404.
- Selectors missing or header text format changed → `DRIFT_DETECTED`.
- `inlineQueryResults` is empty for this page type, so DOM is the only reliable source.

## Repair Clues

- If `puppeteer_test_*` classes are removed, switch to GraphQL response interception or fallback to broader `q-*` class patterns.
- If counts fail to parse, verify Unicode digit handling (`\p{Nd}`) for localized Space UIs.
