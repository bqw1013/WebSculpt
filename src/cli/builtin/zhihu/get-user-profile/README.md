# zhihu/get-user-profile

Fetch detailed profile information of a Zhihu user.

## Description

This command navigates to a Zhihu user's profile page and extracts name, headline, location, IP location, industry, education history, follower/followee counts, voteup/thanked/favorite counts, and content statistics.

## Prerequisites

This command requires a live browser automation session via `playwright-cli`. Before using it:

1. Open Chrome or Edge and visit `chrome://inspect/#remote-debugging`
2. Enable **"Allow this browser instance to be remotely debugged"**
3. In your terminal, run:
   ```bash
   playwright-cli attach --cdp=chrome --session=default
   ```
4. Then you can call this command

> If the browser session is not attached, you will see the `PLAYWRIGHT_CLI_ATTACH_REQUIRED` error.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `user` | Yes | — | Zhihu user ID (e.g., `example-zhihu-user`) or full profile URL |

## Return Value

```json
{
  "success": true,
  "data": {
    "name": "User Name",
    "headline": "User headline",
    "location": "Beijing",
    "ipLocation": "Beijing",
    "industry": "Internet",
    "education": [
      { "school": "Tsinghua University", "major": "Computer Science" }
    ],
    "followerCount": 1000,
    "followeeCount": 500,
    "voteupCount": 5000,
    "thankedCount": 300,
    "favoriteCount": 200,
    "answerCount": 100,
    "articleCount": 50,
    "pinCount": 20,
    "columnCount": 3,
    "videoCount": 5,
    "questionCount": 10,
    "collectionCount": 8,
    "underlineCount": 2
  }
}
```

## Usage Examples

Fetch a user profile by ID:

```bash
websculpt zhihu get-user-profile --user example-zhihu-user
```

Fetch a user profile by URL:

```bash
websculpt zhihu get-user-profile --user https://www.zhihu.com/people/example-zhihu-user
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `MISSING_PARAM` | The `user` parameter is required. |
| `NOT_FOUND` | User not found or the page returned 404. |
| `DRIFT_DETECTED` | Could not extract profile data; page structure may have changed. |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | Browser CDP session is not attached. |
