# zhihu/get-hot

Generated draft for a `browser` runtime command.

## Description

Fetches the current Zhihu hot list from the rendered `https://www.zhihu.com/hot` page.
It uses the browser runtime because Zhihu's direct API can require authentication and direct static requests may return an anti-crawl challenge.

## Parameters

- `limit` optional, default `20`: maximum number of hot list items to return. Valid range is `1` to `50`.

## Return Value

Returns a JSON object:

```json
{
  "source": "https://www.zhihu.com/hot",
  "count": 2,
  "items": [
    {
      "rank": 1,
      "title": "Question title",
      "url": "https://www.zhihu.com/question/...",
      "hot": "2013 万热度"
    }
  ]
}
```

## Usage

```
websculpt zhihu get-hot
websculpt zhihu get-hot --limit 10
```

## Common Error Codes

- `INVALID_LIMIT`: `limit` is not an integer from `1` to `50`.
- `DRIFT_DETECTED`: the rendered Zhihu page did not expose the expected hot list structure.
- `EMPTY_RESULT`: no hot list items were extracted.
