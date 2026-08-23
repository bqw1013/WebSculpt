# hackernews/get-show

Reads the current Hacker News Show HN listing in the same order as the public `/show` page.

## Description

The command uses an attached Chrome or Edge browser to preserve the live HN page ranking. It follows the `show?p=N` pagination links when more than 30 stories are requested. No login or API key is required.

## Parameters

- `limit` (optional, default `15`): number of stories to return; must be an integer from `1` to `50`. Requests above 30 read the second Show HN page as needed.

## Return Value

Returns a plain array of story cards:

```ts
Array<{
  rank: number,
  storyId: number,
  title: string,
  url: string | null,
  hnUrl: string,
  author: string,
  createdAt: string,
  points: number,
  numComments: number,
  isTextPost: boolean
}>
```

## Usage

```
websculpt hackernews get-show
websculpt hackernews get-show --limit 50
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is missing, non-numeric, outside `1-50`, or not an integer.
- `NETWORK_ERROR`: Hacker News page navigation failed or returned an HTTP error.
- `RATE_LIMITED`: Hacker News returned HTTP 429.
- `EMPTY_RESULT`: no Show HN stories were returned.
- `DRIFT_DETECTED`: expected Show HN story rows or required fields were not found.
- `BROWSER_ATTACH_REQUIRED`: the WebSculpt browser runtime could not attach to Chrome/Edge; this is reported by the runner.
