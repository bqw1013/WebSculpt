# Evidence: quora/search

This document records the research and validation evidence for the `quora/search` command.

## Exploration Path

- Confirmed no existing `quora/search` command in the local library.
- Read the WebSculpt explore, capture, and maintain guides before browser operations.
- Used `playwright-cli` to attach a Chrome CDP session and used only the Quora search tab created for this task.
- Explore assessment passed; path is capture-eligible as `quora/search`.

## Verified URLs

- `https://www.quora.com/search?q=artificial%20intelligence`
- `https://www.quora.com/search?q=artificial%20intelligence&type=question`
- `https://www.quora.com/search?q=artificial%20intelligence&type=answer`
- `https://www.quora.com/search?q=artificial%20intelligence&type=post`
- `https://www.quora.com/search?q=artificial%20intelligence&type=profile`
- `https://www.quora.com/search?q=artificial%20intelligence&type=topic`
- `https://www.quora.com/search?q=artificial%20intelligence&type=tribe`

## Structural Evidence

- Hydrated page state: `window.ansFrontendGlobals.earlySettings.rootQueryVariables`; the initial `data.inlineQueryResults` object was empty, while hydration issued GraphQL.
- API: `POST https://www.quora.com/graphql/gql_para_POST?q=SearchResultsListQuery`; JSON body has `queryName`, variables (`query`, `resultType`, `time`, `sortOrder`, `first`, `after`, etc.), and persisted hash `deb8d8c3f230ef7568c0895df972ada793afb470ecd151e07453f7b7c0e51134`.
- API headers are page-context derived (`formkey`, `revision`, `windowId`, `broadcastId`, and current `cf-turnstile-response`). `searchConnection.edges[].node` contains native type-specific fields; `pageInfo.hasNextPage/endCursor` provides cursor pagination.
- Native types verified: question, answer, post, profile, topic, and tribe (Spaces). Quora UI confirmed `type=tribe` for Spaces; `sortOrder=time_descending` for Most recent; `time=month` for Past month.
- DOM fallback selectors: `.puppeteer_test_question_component_base`, `.puppeteer_test_question_title`, `.puppeteer_test_answer_content`, `.puppeteer_test_votable_upvote_button`, `.answer_timestamp`, `.post_timestamp`, and result links under `/profile/`, `/topic/`, or external `*.quora.com` Spaces hosts.
- Scrolling the topic result list increased visible results and caused additional `SearchResultsListQuery` requests, confirming incremental cursor loading.

## Failure Signals

- Quora reports `cdn: "cloudflare"` and includes hidden challenge-solver inputs in the page. The current browser session completed the challenge; the command reuses the session only and never bypasses or generates tokens.
- Omitting the persisted hash produced an HTTP 200 GraphQL `Server Error`; changed hash, missing page formkey/revision, expired session, HTTP errors, GraphQL errors, or malformed `searchConnection` activate the DOM fallback.
- The fallback re-navigates the exact URL before reading cards. A visible no-result message is a valid empty result; blocked challenge/login pages or a non-empty-looking page with no cards produce `DRIFT_DETECTED`.
- Serial pages, a 100-result cap, short randomized waits, and best-effort pointer/scroll nudges keep browser traffic light. No detail-page fan-out, parallel requests, CAPTCHA bypass, or bulk scrolling is used.

## Capture Assessment

Capture is justified: the Quora public search path is parameterizable, has a stable persisted GraphQL connection with cursor pagination and full native nodes, and has a bounded visible DOM fallback. The command is search-only and exposes Cloudflare/session limitations rather than bypassing them.
