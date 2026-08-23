# hackernews/get-new

Fetch newest Hacker News story submissions through the official public API.

## Description

Returns the newest eligible Hacker News stories in chronological order, matching the purpose of HN's `new` feed. No browser, account, or API key is needed.

## Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `limit` | No | `15` | Number of newest stories to return. Accepts integers from `1` through `50`. |

## Return Value

An array ordered newest first. Each item contains `rank`, `storyId`, `title`, `url` (or `null` for a text post), `hnUrl`, `author`, `createdAt` (ISO 8601), `points`, `numComments`, and `isTextPost`.

## Usage

```
websculpt hackernews get-new

# Get five newest stories
websculpt hackernews get-new --limit 5
```

## Common Error Codes

| Code | Meaning |
| --- | --- |
| `INVALID_PARAM` | `limit` is not an integer between 1 and 50. |
| `NETWORK_ERROR` | The API could not be reached after one retry. |
| `RATE_LIMITED` | The API returned HTTP 429. |
| `API_ERROR` | The API returned a non-success HTTP status. |
| `DRIFT_DETECTED` | The documented API response shape changed materially. |
| `EMPTY_RESULT` | No eligible story was available in the API response. |
