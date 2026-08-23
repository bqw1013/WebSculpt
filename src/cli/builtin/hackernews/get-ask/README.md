# hackernews/get-ask

Generated draft for a `node` runtime command.

## Description

Fetches Hacker News' Ask feed through the public Firebase API. Results preserve the order of `askstories.json`, which was verified against the public `/ask` page. The feed includes every item in HN's Ask section, including titles without an `Ask HN:` or `Tell HN:` prefix. No browser, account, or API key is required.

## Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `limit` | No | `15` | Number of stories to return; an integer from `1` through `50`. If fewer stories are currently available, all available stories are returned. |

## Return Value

Returns an array ordered by HN Ask rank. Each item contains:

```ts
{
  rank: number,
  storyId: number,
  title: string,
  url: string | null,
  hnUrl: string,
  author: string,
  createdAt: string,
  points: number,
  numComments: number,
  isTextPost: boolean,
  text: string | null,
  titleKind: "ask" | "tell" | "other"
}
```

`text` is the self-post body as supplied by HN (HTML/escaped text is not converted to Markdown). `titleKind` is informational and is derived from the title prefix; it does not filter feed membership.

## Usage

```
websculpt hackernews get-ask
websculpt hackernews get-ask --limit 1
websculpt hackernews get-ask --limit 50
```

## Common Error Codes

- `INVALID_PARAM` — `limit` is not an integer from 1 through 50.
- `NETWORK_ERROR` — the API could not be reached after one retry.
- `RATE_LIMITED` — the API returned HTTP 429.
- `API_ERROR` — the API returned another non-success status.
- `DRIFT_DETECTED` — the API response shape or required item fields changed.
- `EMPTY_RESULT` — no eligible Ask story was available.
