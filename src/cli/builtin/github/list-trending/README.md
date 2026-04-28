# github/list-trending

Fetch trending repositories from GitHub Trending page.

## Description

This command navigates to the GitHub Trending page and extracts the list of trending repositories, including repository name, description, primary programming language, and stars gained in the selected time range.

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
| `language` | No | `""` | Programming language filter (e.g. `python`, `typescript`, `go`, `rust`). Leave empty for all languages. |
| `since` | No | `daily` | Time range for trending calculation. `daily` = today, `weekly` = this week, `monthly` = this month. |
| `limit` | No | `10` | Maximum number of repositories to return. |

## Return Value

```json
{
  "items": [
    {
      "name": "owner / repo",
      "description": "Repository description text",
      "language": "Python",
      "starsToday": "1,234 stars today"
    }
  ]
}
```

## Usage Examples

Get today's top 10 trending repositories across all languages:
```bash
websculpt github list-trending
```

Get today's top 5 trending Python repositories:
```bash
websculpt github list-trending --language python --limit 5
```

Get this week's top 8 trending TypeScript repositories:
```bash
websculpt github list-trending --language typescript --since weekly --limit 8
```

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `MISSING_PARAM` | Invalid `since` value provided. Must be `daily`, `weekly`, or `monthly`. |
| `EMPTY_RESULT` | No repositories were found on the page. |
| `DRIFT_DETECTED` | Page structure may have changed, unable to extract data. |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | Browser CDP session is not attached. Please follow the Prerequisites section above. |
