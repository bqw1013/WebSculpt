# hackernews/get-jobs

## Description

Read YC startup job postings from Hacker News' public `jobs` navigation feed. The command preserves HN's page rank, follows the 30-row `More` cursor when needed, and enriches each row with the public Firebase job record. No Hacker News account or API key is required, but an attached Chrome or Edge session with remote debugging must be available.

## Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `limit` | No | `15` | Number of jobs to return, from `1` through `50`. A value above 30 follows HN's `More` pagination. |

## Return Value

Returns an array ordered by HN jobs-page rank. Each item contains:

```ts
{
  rank: number,
  storyId: number,
  title: string,
  url: string | null,
  hnUrl: string,
  author: string,
  createdAt: string, // ISO 8601 UTC
  points: number,
  text: string | null // HN's original job-description HTML, when present
}
```

For text-only job posts, `url` is `null` and `hnUrl` points to the HN discussion. The `rank` value remains the original HN rank across pages.

## Usage

```bash
# Get the first 15 current jobs
websculpt hackernews get-jobs

# Fetch 50 jobs across the first two HN pages
websculpt hackernews get-jobs --limit 50
```

## Common Error Codes

| Code | Meaning |
| --- | --- |
| `INVALID_PARAM` | `limit` is not an integer between 1 and 50. |
| `BROWSER_ATTACH_REQUIRED` | WebSculpt could not attach the required Chrome/Edge session. |
| `NETWORK_ERROR` | HN or Firebase could not be reached or timed out. |
| `RATE_LIMITED` | HN or Firebase returned HTTP 429. |
| `API_ERROR` | HN or Firebase returned another non-success status. |
| `DRIFT_DETECTED` | The jobs page, pagination link, or Firebase job shape changed. |
| `EMPTY_RESULT` | No eligible jobs were available. |
