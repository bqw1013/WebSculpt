# medium/get-article

## Description

Fetch the full structured content of a single Medium article by URL. The command extracts metadata, body text, and body HTML from Medium's embedded Apollo state, and optionally loads responses via Medium's `PagedThreadedPostResponsesQuery` GraphQL endpoint.

## Parameters

- `url` (required): Full Medium article URL. Both forms are supported:
  - Personal: `https://medium.com/@<user>/<slug>-<postId>`
  - Publication: `https://medium.com/<publication>/<slug>-<postId>`
  The `postId` is the 12-character hexadecimal string at the end of the URL.
- `include_responses` (optional, default `false`): Set to `true` to also return the article's responses.
- `responses_limit` (optional, default `50`, range `1-200`): Maximum number of responses to return. Only used when `include_responses` is `true`.
- `expand_responses` (optional, default `false`): Accepted for contract compatibility but has no effect. The GraphQL endpoint already returns the full response body, so no additional expansion is required. Only used when `include_responses` is `true`.

## Return Value

```json
{
  "title": "string",
  "subtitle": "string | null",
  "url": "string",
  "postId": "string",
  "author": {
    "name": "string",
    "username": "string",
    "profileUrl": "string",
    "bio": "string | null",
    "followerCount": "number | null"
  },
  "publication": {
    "name": "string",
    "slug": "string",
    "url": "string",
    "description": "string | null",
    "subscriberCount": "number | null"
  } | null,
  "firstPublishedAt": "string (ISO 8601)",
  "latestPublishedAt": "string (ISO 8601)",
  "readingTimeMinutes": "number",
  "clapCount": "number",
  "responseCount": "number",
  "allowResponses": "boolean",
  "responsesLocked": "boolean",
  "tags": ["string"],
  "topics": ["string"],
  "previewImageUrl": "string | null",
  "wordCount": "number",
  "detectedLanguage": "string | null",
  "isMemberOnly": "boolean",
  "isFullContent": "boolean",
  "bodyText": "string",
  "bodyHtml": "string",
  "responses": [
    {
      "author": { "name": "string", "username": "string", "profileUrl": "string" },
      "title": "string",
      "subtitle": "string",
      "text": "string",
      "html": "string",
      "clapCount": "number",
      "url": "string",
      "postId": "string",
      "uniqueSlug": "string",
      "publishedAt": "string (ISO 8601)",
      "updatedAt": "string (ISO 8601)",
      "readingTimeMinutes": "number | null",
      "isLockedPreviewOnly": "boolean"
    }
  ] | undefined,
  "partial": { "body": "string", "responses": "string" } | undefined
}
```

## Usage

```bash
websculpt medium get-article --url "https://medium.com/@user/my-article-abc123def456"

websculpt medium get-article --url "https://medium.com/@user/my-article-abc123def456" --include-responses true

websculpt medium get-article --url "https://medium.com/@user/my-article-abc123def456" --include-responses true --expand-responses true --responses-limit 20
```

## Common Error Codes

- `MISSING_PARAM`: `--url` is required.
- `INVALID_PARAM`: URL is malformed or `responses_limit` / `expand_responses` is invalid.
- `NOT_FOUND`: The article does not exist or returned Medium's 404 page.
- `PAGE_LOAD_FAILED`: The page loaded but Apollo state did not hydrate within the timeout.
- `DRIFT_DETECTED`: The expected page structure changed and extraction could not complete.
