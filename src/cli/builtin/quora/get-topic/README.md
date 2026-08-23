# quora/get-topic

Fetch a Quora topic page by its slug.

## Description

`websculpt quora get-topic` reads one view of a Quora topic (`https://www.quora.com/topic/<slug>`). It always returns topic metadata (name, slug, URL, numeric tid, follower count) plus a list of items from the selected section.

The command prefers Quora's internal GraphQL endpoints for the `read` and `top_questions` sections and falls back to visible DOM extraction if GraphQL fails or the schema drifts. The `writers` section is extracted from the server-rendered HTML because no dedicated GraphQL endpoint was observed.

## Parameters

- `topic` (required): topic slug, the last segment of the URL `https://www.quora.com/topic/<slug>`. Example: `Technology`, `Artificial-Intelligence`.
- `section` (optional, default `read`): which tab to return.
  - `read` — mixed feed of answers and related questions (Quora's default "Read" tab).
  - `top_questions` — open questions waiting for answers.
  - `writers` — most viewed writers in the topic, ranked by 30-day answer views.
- `limit` (optional, default `20`): maximum items to return, integer from `1` to `100`. The `read` and `top_questions` streams lazy-load until the limit or end of stream. `writers` is a short fixed list; if fewer writers exist than the limit, all are returned and `partial=true`.

## Return Value

```json
{
  "topic": {
    "name": "Technology",
    "slug": "Technology",
    "url": "https://www.quora.com/topic/Technology",
    "tid": 2177,
    "followerCount": 156000000
  },
  "section": "read",
  "limit": 20,
  "items": [...],
  "count": 20,
  "partial": false,
  "source": "api"
}
```

Each item in `items` has a `type` field:

- `answer`: `{ type, id, url, title, excerpt, publishedAt, author, question, metrics }`
- `question`: `{ type, id, url, title, author, metrics }`
- `writer`: `{ type, rank, name, profileUrl, credential, answerViews, answerCount }`

`metrics` for answers contains `upvotes`, `comments`, `shares`, `views`. For questions it contains `answers` and `followers`.

`source` is `"api"` when results came from GraphQL, `"dom"` when DOM fallback was used. `partial=true` means the stream ended before reaching `limit`.

## Usage

```bash
websculpt quora get-topic --topic Technology --section read --limit 10
websculpt quora get-topic --topic Artificial-Intelligence --section top_questions --limit 15
websculpt quora get-topic --topic Creative-Writing --section writers
```

## Common Error Codes

- `MISSING_PARAM`: `topic` was omitted or blank.
- `INVALID_PARAM`: invalid `section`, non-integer `limit`, or `topic` contains URL path characters.
- `LIMIT_EXCEEDED`: `limit` is greater than `100`.
- `NOT_FOUND`: the topic slug does not exist (Quora redirects to a "Page Not Found" page).
- `DRIFT_DETECTED`: both GraphQL and DOM extraction failed; the page structure may have changed.
- `BROWSER_ATTACH_REQUIRED`: Chrome/Edge remote debugging is not enabled or the browser is not reachable.

## Notes

- A logged-in Quora session is recommended. Anonymous access may hit Quora's login wall.
- The command performs light pointer/scroll nudges (random waits, mouse movement, small scrolls) to keep polite pacing.
- Discover topic slugs with `websculpt quora search --query <name> --type topic`.
