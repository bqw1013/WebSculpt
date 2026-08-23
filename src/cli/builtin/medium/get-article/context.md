# Context

## Precipitation Background (Why This Command Exists)

The existing Medium command family (`get-staff-picks`, `get-tag-trending`, `list-topics`, `search`) only returns lists of stories. There was no way to fetch a single article's full metadata and body by URL. This command fills that gap.

## Value Assessment

Single-article extraction is a basic building block for summarization, archiving, content analysis, and chaining with list commands. The Apollo-state path is stable across personal and publication URLs and requires no API key.

## Page Structure

- URL forms:
  - `https://medium.com/@<user>/<slug>-<postId>`
  - `https://medium.com/<publication>/<slug>-<postId>`
- `postId` is the last 12-character hex token of the final path segment.
- Each article page embeds `window.__APOLLO_STATE__`.
- Target post object: `window.__APOLLO_STATE__['Post:<postId>']`.
- Body paragraphs: `post['content({"postMeteringOptions":{"referrer":""}})'].bodyModel.paragraphs`.
- Paragraph nodes are keyed `Paragraph:<id>` and contain `type`, `text`, `markups`, and image metadata.
- Responses are loaded via Medium's `PagedThreadedPostResponsesQuery` GraphQL endpoint (`POST /_/graphql`). The query returns `post(id).threadedPostResponses(paging:, sortType: TOP).posts`, where each post is a full response object with `content(postMeteringOptions: {}).bodyModel.paragraphs`.

## Environment Dependencies

- Chrome or Edge with remote debugging enabled.
- No login required.
- Member-only stories return only the free preview (`isMemberOnly: true`).

## Failure Signals

- Apollo state missing or target `Post:<postId>` absent + page body contains `PAGE NOT FOUND 404` → `NOT_FOUND`.
- Apollo state never hydrates after navigation → `PAGE_LOAD_FAILED` or `DRIFT_DETECTED`.
- GraphQL response endpoint fails or returns errors when responses requested → returns loaded `responses` (possibly empty) with partial note.
- Response post structure changes (field names in `PagedThreadedPostResponsesQuery`) → `DRIFT_DETECTED`.

## Repair Clues

- If Medium changes the Apollo key for body content, update the `contentKey` lookup (`Object.keys(post).find(k => k.startsWith('content('))`).
- If response GraphQL field names change, update the `PagedThreadedPostResponsesQuery` query in `extractResponses`.
- If markup types change, extend `applyMarkups` (used by both the article body builder and the response body builder).
