# Evidence: medium/get-article

This document records the research and validation evidence for the `medium/get-article` command.

## Exploration Path

1. Checked the WebSculpt command library: existing Medium commands (`get-staff-picks`, `get-tag-trending`, `list-topics`, `search`) do not fetch a single article by URL. A new command is required.
2. Read the browser runtime contract.
3. Attached a `@playwright/cli` session to the user's Chrome instance.
4. Navigated to representative personal and publication article URLs, extracted `window.__APOLLO_STATE__`, inspected the DOM `<article>`, and verified the responses modal behavior.

## Verified URLs

- `https://medium.com/age-of-awareness/reading-is-dying-but-what-counts-as-reading-452d8220606f` (publication article, member-only preview, 24 responses)
- `https://medium.com/@juliethujunwa/science-in-schools-teaching-the-mathematics-behind-the-artificial-intelligence-revolution-fa094933dcf5` (personal article, free)
- `https://medium.com/blog/write-for-humans-not-algorithms-f66ab282a00d` (publication article, free, 68 responses)
- `https://medium.com/@tobrien/whats-an-orchestrator-and-why-does-software-need-one-5079bd71e57e` (personal article, free, 13 responses)
- `https://medium.com/@nonexistentuser/this-article-does-not-exist-123456789abc` (404 test)

## Structural Evidence

### Post identification
- Medium article pages embed `window.__APOLLO_STATE__`.
- The target post object is keyed `Post:<postId>`.
- `<postId>` is the 12-character hexadecimal suffix at the end of the last URL path segment.
- Example: URL `.../reading-is-dying-but-what-counts-as-reading-452d8220606f` → `postId = 452d8220606f`.

### Metadata fields (from `Post:<postId>`)
- `title`
- `extendedPreviewContent.subtitle` / `previewContent.subtitle`
- `firstPublishedAt`, `latestPublishedAt`
- `creator` → `User:<id>` with `name`, `username`, `imageId`, `bio`, `socialStats.followerCount`
- `collection` → `Collection:<id>` with `name`, `slug`, `description`, `subscriberCount`
- `readingTime`, `clapCount`, `postResponses.count`
- `tags` (array of refs to `Tag:<slug>`)
- `topics` (array of `{slug}`)
- `previewImage.id`
- `wordCount`, `detectedLanguage`
- `isLocked` (member-only flag), `isLimitedState`, `allowResponses`, `responsesLocked`
- `mediumUrl`, `uniqueSlug`

### Body content
- Body paragraphs live under `content({"postMeteringOptions":{"referrer":""}}).bodyModel.paragraphs`.
- Each paragraph is a `Paragraph:<id>` node with `type`, `text`, `markups`, and optional `metadata.id` for images.
- Observed paragraph types: `P`, `H3`, `H4`, `IMG`, `ULI`.
- Markup types observed: `A` (link), `EM` (emphasis). Implementation also handles `STRONG`, `CODE`, `STRIKE` defensively.
- For member-only stories, `bodyModel.paragraphs` contains only the free preview paragraphs.

### Responses

- Responses are loaded via Medium's `PagedThreadedPostResponsesQuery` GraphQL endpoint (`POST /_/graphql`).
- Query variables: `{ postId: "<postId>", postResponsesPaging: { limit: 10 }, sortType: "TOP" }`.
- Query field: `post(id).threadedPostResponses(paging:, sortType:)`, returning `posts` and `pagingInfo.next`.
- Each response post contains the same fields as a regular post: `id`, `title`, `mediumUrl`, `uniqueSlug`, `firstPublishedAt`, `latestPublishedAt`, `readingTime`, `clapCount`, `previewImage`, `extendedPreviewContent`, `creator`, and `content(postMeteringOptions: {}).bodyModel.paragraphs`.
- The GraphQL response already returns the full response body; no additional expansion step is required.
- Pagination uses `pagingInfo.next.to` as the cursor for subsequent requests.

### 404 signals
- Non-existent articles render a page with title `Medium` and body text containing `PAGE NOT FOUND 404`.
- `window.__APOLLO_STATE__` exists but contains no `Post:*` keys matching the URL-derived `postId`.

## Failure Signals

- `MISSING_PARAM`: `--url` is required.
- `INVALID_PARAM`: URL is not a valid Medium article URL or `responses_limit` / `expand_responses` are malformed.
- `NOT_FOUND`: URL-derived `postId` has no matching `Post:*` key and the page shows Medium's 404 text.
- `DRIFT_DETECTED`: Expected Apollo keys or GraphQL response fields are missing after reasonable waits.
- `PARTIAL_RESULT`: Fewer responses returned than requested because the GraphQL endpoint returned fewer posts than asked or pagination ended early.
- Member-only stories return only the free preview; this is expected and signaled by `isMemberOnly: true`.

## Capture Assessment

This path should be captured as `medium/get-article`. The extraction relies on a stable embedded Apollo state structure and a deterministic URL-derived post ID. Both personal and publication URLs work identically. Responses are loaded via a stable GraphQL endpoint that returns full response bodies. The command fills a clear gap in the existing Medium command family.
