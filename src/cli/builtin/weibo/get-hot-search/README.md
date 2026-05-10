# weibo/get-hot-search

Fetch Weibo (微博) real-time hot search trending topics.

## Description

This command calls Weibo's public `/ajax/side/hotSearch` API to retrieve the current real-time hot search list. It returns a ranked array of trending topics with title, heat value, tag label, and a direct link to the topic's search page.

## Parameters

| Name   | Required | Default | Description                                    |
|--------|----------|---------|------------------------------------------------|
| limit  | No       | 50      | Maximum number of items to return (1–100)     |

## Return Value

Array of objects:

```json
[
  {
    "rank": 1,
    "title": "车企锁电",
    "heat": 1171866,
    "tag": null,
    "url": "https://s.weibo.com/weibo?q=%E8%BD%A6%E4%BC%81%E9%94%81%E7%94%B5"
  },
  {
    "rank": 2,
    "title": "给阿嬷的情书剧组穷成这样",
    "heat": 901875,
    "tag": "热",
    "url": "https://s.weibo.com/weibo?q=%E7%BB%99%E9%98%BF%E5%AC%A4%E7%9A%84%E6%83%85%E4%B9%A6%E5%89%A7%E7%BB%84%E7%A9%B7%E6%88%90%E8%BF%99%E6%A0%B7"
  }
]
```

Fields:
- `rank`: Display rank (1-based)
- `title`: Topic title
- `heat`: Heat value (integer, or `null` if unavailable)
- `tag`: Tag label such as `新` (new), `热` (hot), `沸` (boiling), or `null`
- `url`: Link to the topic search page on Weibo

## Usage

```bash
websculpt weibo get-hot-search
websculpt weibo get-hot-search --limit 20
websculpt weibo get-hot-search --limit 10
```

## Common Error Codes

| Code           | Meaning                                          |
|----------------|--------------------------------------------------|
| INVALID_PARAM  | `limit` is not an integer or out of 1–100 range  |
| NETWORK_ERROR  | HTTP request failed (non-2xx status)             |
| PARSE_ERROR    | Response body is not valid JSON                  |
| API_ERROR      | Weibo API returned `ok !== 1`                    |
| EMPTY_RESULT   | API returned an empty hot search list            |
