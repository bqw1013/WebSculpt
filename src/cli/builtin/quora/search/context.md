# Context

## Precipitation Background (Why This Command Exists)

The user requested a search-only Quora command after validating browser-backed search patterns on Substack, YouTube, Medium, and Product Hunt. Quora's current public search page exposes six real result types and a persisted GraphQL connection, making the path reusable.

## Value Assessment

The command covers common Quora discovery workflows with one stable interface and avoids repeating browser exploration. It retains full native nodes so downstream consumers can choose fields without another detail-page crawl.

## Page Structure

Primary URL: `https://www.quora.com/search?q=<query>` with `type=question|answer|post|profile|topic|tribe`, `sortOrder=time_descending` for latest, and `time=<range>` when needed. API: `POST /graphql/gql_para_POST?q=SearchResultsListQuery` with persisted hash `deb8d8c3f230ef7568c0895df972ada793afb470ecd151e07453f7b7c0e51134`; cursor pagination uses `searchConnection.pageInfo.endCursor`.

DOM fallback selectors use Quora's stable `puppeteer_test_question_component_base`, `puppeteer_test_question_title`, `puppeteer_test_answer_content`, `puppeteer_test_votable_upvote_button`, `answer_timestamp`, `post_timestamp`, and result links under `/profile/`, `/topic/`, or external `*.quora.com` Spaces URLs. The fallback always re-navigates the exact target URL before extraction.

## Environment Dependencies

Use the existing WebSculpt Chrome session and page-context `fetch` so cookies, formkey, revision, broadcast/window IDs, and any current `cf-turnstile-response` token are reused. Quora reports `cdn: "cloudflare"` and may issue Turnstile challenges; no challenge bypass is attempted. Requests and cursor pages are serial, capped at 100 results, with short randomized waits and best-effort pointer/scroll nudges.

## Failure Signals

GraphQL HTTP/schema/errors, missing persisted hash, expired session, or challenge failure activate fallback. A visible no-result message is treated as a valid empty result. Missing result selectors, blocked challenge pages, malformed native nodes, or empty fallback on a non-empty-looking page produce `DRIFT_DETECTED`.

## Repair Clues

Keep the persisted query hash and native node envelope as the primary evidence. If the GraphQL hash or node fields change, re-run explore against the current page request before changing the command. DOM cards remain a deliberately partial fallback and must not open result detail pages.
