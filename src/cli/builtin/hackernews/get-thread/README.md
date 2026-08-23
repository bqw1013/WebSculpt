# hackernews/get-thread

Read-only node command backed by the public Hacker News Firebase API.

## Description

Fetches one Hacker News story by numeric ID or canonical item URL, then returns the story metadata and a bounded discussion thread. Comments are flattened in Hacker News order while preserving `depth` and `parentId`, so callers can render or analyze the original nesting. Deleted, dead, and malformed comments are omitted.

## Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `id` | No* | — | Hacker News story ID. Provide exactly one of `id` or `url`. |
| `url` | No* | — | `https://news.ycombinator.com/item?id=...`. Provide exactly one of `url` or `id`. |
| `limit` | No | `50` | Maximum number of live comments to return, from `1` through `200`. |

*Exactly one of `id` and `url` is required.

## Return Value

Returns:

```ts
{
  story: {
    id: number,
    title: string,
    url: string | null,
    hnUrl: string,
    author: string,
    createdAt: string,
    points: number,
    text: string | null,
    isTextPost: boolean,
    totalComments: number
  },
  comments: Array<{
    id: number,
    author: string,
    createdAt: string,
    text: string | null,
    parentId: number,
    depth: number,
    hnUrl: string
  }>,
  returnedComments: number,
  truncated: boolean
}
```

## Usage

```
websculpt hackernews get-thread --id 49104747
websculpt hackernews get-thread --url "https://news.ycombinator.com/item?id=49104392" --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — neither id nor url was supplied, or both were supplied.
- `INVALID_PARAM` — malformed ID/URL or limit outside 1-200.
- `NOT_FOUND` — the root item does not exist or is deleted/dead.
- `INVALID_ITEM` — the root ID is not a story.
- `RATE_LIMITED` — Hacker News returned HTTP 429.
- `NETWORK_ERROR` — the API timed out or could not be reached after one retry.
- `API_ERROR` — the API returned another non-success status.
- `DRIFT_DETECTED` — the API response shape or required fields changed.
