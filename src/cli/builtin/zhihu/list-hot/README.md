# zhihu/list-hot

Fetch current top N entries from Zhihu Hot List.

## Description

This command navigates to the Zhihu Hot page (https://www.zhihu.com/hot) and extracts the hot list entries, including rank, title, heat value, and link.

## Prerequisites

This command requires a browser environment. Before using it:

1. Open Chrome or Edge and visit `chrome://inspect/#remote-debugging`
2. Enable **"Allow this browser instance to be remotely debugged"**
3. Leave the browser open, then run this command

> If the browser is not running with remote debugging enabled, you will see the `BROWSER_ATTACH_REQUIRED` error.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `50` | Maximum number of hot list entries to return. |

## Return Value

```json
{
  "total": 50,
  "hotList": [
    {
      "rank": 1,
      "title": "Entry title text",
      "heat": "1234 万热度",
      "href": "https://www.zhihu.com/question/123456789"
    }
  ]
}
```

## Usage Examples

Get top 50 hot entries (default):

```bash
websculpt zhihu list-hot
```

Get top 10 hot entries:

```bash
websculpt zhihu list-hot --limit 10
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `EMPTY_RESULT` | No entries were found on the page. |
| `DRIFT_DETECTED` | Page structure may have changed, unable to extract data. |
| `BROWSER_ATTACH_REQUIRED` | Browser remote debugging is not enabled. Please follow the Prerequisites section above. |
