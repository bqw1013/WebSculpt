# Evidence: quora/get-topic

This document records the research and validation evidence for the `quora/get-topic` command.

## Exploration Path

- Checked command library with `websculpt command list quora`; existing `quora/search` covers topic discovery but not topic detail, so a new command is needed.
- Read the browser automation guide.
- Attached to a Chrome session with Playwright CLI and created one dedicated tab for all page visits.
- Used `eval`, `requests`, `request-body`, and `response-body` to inspect DOM and GraphQL traffic.
- Used Python scripts to parse saved GraphQL JSON responses.

## Verified URLs

- `https://www.quora.com/topic/Technology`
- `https://www.quora.com/topic/Technology/top_questions`
- `https://www.quora.com/topic/Technology/writers`
- `https://www.quora.com/topic/Artificial-Intelligence`
- `https://www.quora.com/topic/Artificial-Intelligence/top_questions`
- `https://www.quora.com/topic/Artificial-Intelligence/writers`
- `https://www.quora.com/topic/ThisTopicDoesNotExist12345` (404 behavior)

## Structural Evidence

### Topic Metadata

- Topic name is rendered in `<h1>`.
- Follower count and Follow/Following button are in the header area near the `<h1>`.
- Topic numeric ID (`tid`) is embedded in `window.ansFrontendGlobals`:
  - `window.ansFrontendGlobals.earlySettings.rootQueryVariables.tid`
  - `window.ansFrontendGlobals.earlySettings.rootProps.tid`
  - `window.ansFrontendGlobals.settings.inlinedQueryVariables.TopicPageLoadableQuery.tid`

### Tabs

- Three tabs are implemented as `[role="tab"]` DIV elements with inner text:
  - `Read` (default)
  - `Answer`
  - `Most viewed writers`
- Corresponding URL paths:
  - Read: `https://www.quora.com/topic/<slug>`
  - Answer (top questions): `https://www.quora.com/topic/<slug>/top_questions`
  - Most viewed writers: `https://www.quora.com/topic/<slug>/writers`

### Read Section

- Initial GraphQL query: `TopicReadMultifeedLoggedIn_Query`
  - URL: `POST /graphql/gql_para_POST?q=TopicReadMultifeedLoggedIn_Query`
  - Variables: `{ multifeedAfter: null, multifeedNumBundlesOnClient: 0, tid: <tid>, first: 10 }`
  - Hash: `85e2a43cffae3fe630b779b96720448232e9c751e94f89021fdb548d63e0aa26`
- Pagination query: `MultifeedQuery`
  - URL: `POST /graphql/gql_para_POST?q=MultifeedQuery`
  - Variables: `{ first: 10, multifeedAfter: <cursor>, multifeedNumBundlesOnClient: <loaded>, multifeedPage: "topic", pageData: <tid>, ... }`
  - Hash: `86ca248542a7f425d2f862f38cb27383cae77a9c91aa8d50b890b022941f26bf`
- Response shape: `data.multifeedObject.multifeedConnection.edges[].node`
  - Bundle types observed: `AnswersBundle`, `QuestionsBundle`, `AdBundle`
  - `AnswersBundle` contains `bundleConnection.edges[].node` of `AnswerFeedStory` with `answer`
  - `QuestionsBundle` contains `bundleConnection.edges[].node` of `QuestionFeedStory` with `question`
  - `AdBundle` is advertisement; filtered by default
- Answer fields used: `aid`, `url`, `permaUrl`, `content`, `numUpvotes`, `numDisplayComments`, `numShares`, `numViews`, `creationTime`, `author`, `question`
- Question fields used: `qid`, `url`, `slug`, `title`, `followerCount`, `decanonicalizedAnswerCount`, `asker`

### Top Questions Section

- Initial GraphQL query: `TopicWriteMultifeed_Query`
  - URL: `POST /graphql/gql_para_POST?q=TopicWriteMultifeed_Query`
  - Variables: `{ multifeedAfter: null, multifeedNumBundlesOnClient: 0, tid: <tid>, first: 10 }`
  - Hash: `b2540a442dabbfd0f8f4636823cfe277ff1a5c1a52408c6090ece6860e46bc16`
- Pagination query: `MultifeedQuery`
  - Variables: `{ ..., multifeedPage: "top_questions_in_topic", pageData: <tid>, ... }`
  - Hash: same as Read pagination
- Response shape: `data.multifeedObject.multifeedConnection.edges[].node`
  - Bundle type: `QuestionsBundle`
  - Stories are in `node.stories[]` directly (not nested in `bundleConnection`)
  - Each story is `QuestionFeedStory` with `question`

### Writers Section

- No dedicated GraphQL POST observed; list appears to be server-rendered into the initial HTML.
- `window.ansFrontendGlobals.data.inlineQueryResults` does not contain writer data.
- Extraction strategy combines the server-rendered text pattern with real profile links:
  - Body text follows a regular pattern: `<views> views <name>[, credential] <answers> answers Follow`.
  - A global regex extracts views, name/credential block, and answer count.
  - The parsed name is matched against the visible `a[href*="/profile/"]` links to obtain the actual profile slug.
  - Credential is the text after the first comma in the name block (e.g. `Asim Qureshi, CEO of Jibble`).
  - List length is fixed (~10 writers); no scroll loading or "Show more" observed.

### DOM Fallback

- `window.ansFrontendGlobals.data.inlineQueryResults` is mostly empty on topic pages.
- Fallback selectors from existing `quora/search` command:
  - `.puppeteer_test_question_title`
  - `.puppeteer_test_answer_content`
  - `.puppeteer_test_votable_upvote_button`
  - `.puppeteer_test_question_component_base`

## Failure Signals

- **Topic not found**: navigating to `/topic/<nonexistent>` redirects to `https://www.quora.com/<slug>` (without `/topic/`), page title becomes `(1) Error`, body contains "Page Not Found" and "We searched everywhere but couldn't find the page you were looking for.", and `tid` is not available in `ansFrontendGlobals`.
- **Login wall**: not observed in logged-in session; anonymous access may show signup prompts or truncated feeds.
- **Cloudflare challenge**: challenge requests to `challenges.cloudflare.com` are present but are handled by the attached Chrome session.
- **GraphQL hash drift**: if a hash becomes invalid, Quora returns GraphQL errors. Implementation falls back to DOM extraction and throws `DRIFT_DETECTED` only when both API and DOM fail.
- **Empty feed**: valid topic may return zero results; this is returned as empty `items` array without an error.

## Capture Assessment

This command should be captured. The Read and Top Questions sections have stable GraphQL endpoints with verified pagination. The Writers section has no clean API but is server-rendered and extractable via DOM. A DOM fallback covers GraphQL drift. The command fills a clear gap next to `quora/search` and is reusable for any Quora topic slug.
