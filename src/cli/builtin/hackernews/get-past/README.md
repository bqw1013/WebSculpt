# hackernews/get-past

Reads the public HN past page through an attached WebSculpt browser session.

## Description

Fetch a historical Hacker News front-page snapshot. When `date` is omitted, the command uses HN's own latest complete-day view; when provided, it reads that day's `past` page. It uses the public HN page in the attached browser to preserve historical rank and Firebase item records for stable story metadata. No HN account or API key is needed, but a browser session must be available to WebSculpt.

## Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `date` | No | HN default | Real calendar date in strict `YYYY-MM-DD` format. Future dates and impossible dates are rejected. |
| `limit` | No | `15` | Number of eligible stories to return; accepts integers from `1` through `50`. |

## Return Value

Returns an object with `snapshotDate` (the actual HN snapshot date) and `items`, an array ordered by historical front-page rank. Each item contains `rank`, `storyId`, `title`, `url` (or `null` for a text post), `hnUrl`, `author`, `createdAt` (ISO 8601 UTC), `points`, `numComments`, and `isTextPost`.

## Usage

```
websculpt hackernews get-past

# Get a specific historical day
websculpt hackernews get-past --date 2026-07-28 --limit 20
```

## Common Error Codes

| Code | Meaning |
| --- | --- |
| `INVALID_PARAM` | `date` is not a real non-future `YYYY-MM-DD` date, or `limit` is outside `1` to `50`. |
| `BROWSER_ATTACH_REQUIRED` | WebSculpt could not attach the browser session required by this command. |
| `NETWORK_ERROR` | HN page/API could not be reached. |
| `RATE_LIMITED` | HN returned HTTP 429. |
| `API_ERROR` | HN returned another non-success HTTP status. |
| `DRIFT_DETECTED` | The HN page or Firebase response shape changed materially. |
| `EMPTY_RESULT` | No eligible stories were available for the snapshot. |
