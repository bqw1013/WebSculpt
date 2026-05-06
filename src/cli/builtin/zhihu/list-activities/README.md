# zhihu/list-activities

Fetch the latest activities (pins, answers, articles) from a Zhihu user's activities page.

## Description

This command navigates to a Zhihu user's activities page and extracts the most recent activities, including type, time, title, content preview, and URL.

## Prerequisites

This command requires a live browser automation session via `playwright-cli`. Before using it:

1. Open Chrome or Edge and visit `chrome://inspect/#remote-debugging`
2. Enable **"Allow this browser instance to be remotely debugged"**
3. In your terminal, run:
   ```bash
   playwright-cli attach --cdp=chrome --session=default
   ```
4. Then you can call this command

> If the browser session is not attached, you will see the `BROWSER_ATTACH_REQUIRED` error.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `user` | Yes | — | Zhihu user ID (e.g., `yu-you-56-63`) or full profile URL |
| `limit` | No | `10` | Maximum number of activities to return |

## Return Value

```json
{
  "userId": "yu-you-56-63",
  "activitiesUrl": "https://www.zhihu.com/people/yu-you-56-63/activities",
  "total": 10,
  "activities": [
    {
      "type": "赞同了回答",
      "time": "2 hours ago",
      "title": "Answer title",
      "content": "Content preview...",
      "url": "https://www.zhihu.com/question/123/answer/456"
    }
  ]
}
```

## Usage Examples

Fetch latest 10 activities:

```bash
websculpt zhihu list-activities --user yu-you-56-63
```

Fetch latest 5 activities:

```bash
websculpt zhihu list-activities --user yu-you-56-63 --limit 5
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `MISSING_PARAM` | The `user` parameter is required. |
| `NOT_FOUND` | User does not exist or the page was redirected. |
| `AUTH_REQUIRED` | Zhihu requires login to view this page. |
| `DRIFT_DETECTED` | Activity list selector not found. Page structure may have changed. |
| `EMPTY_RESULT` | No activities found for the user. |
| `BROWSER_ATTACH_REQUIRED` | Browser CDP session is not attached. |
