# Evidence: quora/get-feed

This document records the research and validation evidence for the `quora/get-feed` command.

## Exploration Path

- Checked the existing command library with `websculpt command list quora`. Only `quora/search` exists; no `quora/get-feed` command was available.
- Read the existing `quora/search` implementation to reuse proven patterns (GraphQL headers, qtext parsing, DOM fallback).
- Read the browser automation guide before any browser automation.
- Created a dedicated Playwright CLI session, opened a fresh tab, and navigated to `https://www.quora.com/` and `https://www.quora.com/following`.
- Intercepted network traffic with `page.on('request')` / `page.on('response')` to capture the real GraphQL feed requests.
- Scrolled the home feed to trigger pagination and captured consecutive `MultifeedQuery` requests.
- Tested direct GraphQL calls from the page context to confirm the endpoint, hash, and variables work without server-side rendering.

## Verified URLs

- `https://www.quora.com/` — Home / personalized recommendation feed.
- `https://www.quora.com/following` — Following feed (empty for the observed account; onboarding page observed).
- `https://www.quora.com/ThisQuestionDoesNotExist12345` — 404 error page for failure-signal calibration.
- `POST https://www.quora.com/graphql/gql_para_POST?q=MultifeedQuery` — Verified feed GraphQL endpoint.

## Structural Evidence

### GraphQL feed source

- **Operation**: `MultifeedQuery`
- **Endpoint**: `POST /graphql/gql_para_POST?q=MultifeedQuery`
- **Hash**: `86ca248542a7f425d2f862f38cb27383cae77a9c91aa8d50b890b022941f26bf`
- **Request variables**:
  ```json
  {
    "first": 8,
    "multifeedAfter": null,
    "multifeedNumBundlesOnClient": 0,
    "injectionType": null,
    "injectionData": null,
    "filterStoryType": null,
    "filterStoryOid": null,
    "multifeedPage": "home_page",
    "pageData": 0,
    "showLiveBanner": false
  }
  ```
- **Response path**: `data.multifeedObject.multifeedConnection.edges[].node`
- **Pagination**: `data.multifeedObject.multifeedConnection.pageInfo.hasNextPage` / `endCursor`. `multifeedNumBundlesOnClient` must be incremented by the number of bundles returned per page.

### Bundle and story types

| Bundle `__typename` | Story `__typename` | Data location | Action |
|---|---|---|---|
| `AnswersBundle` | `AnswerFeedStory` | `bundleConnection.edges[0].node.answer` | Extract |
| `PostBundle` | `TribePostItemFeedStory` | `stories[0].post` | Extract |
| `QuestionsBundle` | `QuestionFeedStory` | `stories[0].question` | Extract |
| `BrandSafetyAdBundle` | `AdFeedStory` | — | Skip |
| `PromotedAnswerFeedStory` | `PromotedAnswerFeedStory` | — | Skip |
| `AskQuestionPromptBundle` | — | — | Skip |

### Content format

`answer.content` and `question.title` in the `MultifeedQuery` response are returned as **JSON strings** representing Quora's qtext structure. They must be parsed with `JSON.parse` before applying standard qtext extraction (spans / sections).

### DOM fallback selectors

- Feed bundle containers: `[class*='dom_annotate_multifeed_bundle_']`
- Answer title: `.puppeteer_test_question_title`
- Answer body: `.puppeteer_test_answer_content`
- Upvote button: `.puppeteer_test_votable_upvote_button`
- Space post card: `.puppeteer_test_tribe_post_item_feed_story`
- Space name: `.puppeteer_test_tribe_name`
- Author profile link: `a[href^='/profile/']`
- Space domain link: `a[href]` whose hostname ends with `.quora.com` and is not `www.quora.com`

## Failure Signals

- **Not logged in**: Home feed either shows a login wall or redirects to login. Command should detect absence of user context / feed cards and throw `AUTH_REQUIRED`.
- **Empty following feed**: `https://www.quora.com/following` shows `"Build your new following feed"` and `FollowTribesSuggestionsQuery` instead of feed bundles. Return empty items with `partial: true`.
- **404**: Page title `(1) Error`, body contains `Page Not Found`.
- **GraphQL failure / drift**: If the `MultifeedQuery` response lacks `data.multifeedObject.multifeedConnection`, fall back to DOM extraction. If DOM selectors also fail, throw `DRIFT_DETECTED`.
- **Rate limiting**: CAPTCHA, `429`, or `Verify you are human` text in body should be reported as `DRIFT_DETECTED` with an explanatory message.

## Capture Assessment

This path is worth capturing:

- The GraphQL endpoint is stable and reproducible for `home_page`.
- Parameters (`tab`, `limit`) are simple and map cleanly to the page / API.
- Output is valuable for downstream commands like `quora/get-answer` and `quora/get-question`.
- DOM fallback provides resilience if Quora changes the GraphQL schema or hash.
- The only unverified branch is `tab=following` when the account already follows Spaces/users; this should be documented as a post-install test item rather than blocking the command.
