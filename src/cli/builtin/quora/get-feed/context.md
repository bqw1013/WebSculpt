# Context

## Precipitation Background

Quora's home feed is the primary content-discovery surface, mixing answers, questions, and Space posts. Existing `quora/search` only covers keyword search; there was no command to retrieve the personalized recommendation stream or the following stream.

## Value Assessment

High reuse value for anyone tracking Quora trends, curating content, or chaining to `quora/get-answer` / `quora/get-question` for full content.

## Page Structure

- Home feed: `https://www.quora.com/`
- Following feed: `https://www.quora.com/following`
- GraphQL endpoint: `POST /graphql/gql_para_POST?q=MultifeedQuery`
- Hash: `86ca248542a7f425d2f862f38cb27383cae77a9c91aa8d50b890b022941f26bf`
- Response path: `data.multifeedObject.multifeedConnection.edges[].node`
- Bundle types of interest: `AnswersBundle`, `PostBundle`, `QuestionsBundle`
- Skipped bundles: `BrandSafetyAdBundle`, `PromotedAnswerFeedStory`, `AskQuestionPromptBundle`
- DOM fallback containers: `[class*='dom_annotate_multifeed_bundle_']`

## Environment Dependencies

- Chrome/Edge with remote debugging enabled.
- A logged-in Quora session; the command detects login walls and returns `AUTH_REQUIRED`.
- The `following` tab has only been verified for an empty account (onboarding page). Populated following feeds are extracted via DOM fallback and may need adjustments once tested with follows.

## Failure Signals

- Missing `data.multifeedObject.multifeedConnection` in GraphQL response.
- Missing `[class*='dom_annotate_multifeed_bundle_']` containers in DOM.
- Body text contains `Page Not Found`, `Verify you are human`, `429`, or `checking your browser`.

## Repair Clues

- If `MultifeedQuery` hash changes, update `MULTIFEED_HASH` and re-verify variables.
- If bundle classes change, update `bundleTypeFromClass` and DOM selectors.
- If `following` GraphQL path becomes known, migrate `tab=following` from DOM to the API path.
