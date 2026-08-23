# reddit/discover-subreddits

Discover subreddits from Reddit's `/explore/` page through an attached browser.

## Description

This command navigates Reddit's public community-discovery page and extracts structured community cards. It supports the main discovery blocks (`Recommended for you`, `Most popular`, `Curated picks`) as well as category-specific pages such as `Technology`, `Games`, or `Wellness`.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `section` | No | `recommended` | Block to return: `recommended`, `popular`, `curated`, or `category`. |
| `category` | No | — | Category name, required when `section=category`. Values are read dynamically from the `/explore/` sidebar. Supports case-insensitive and partial matching (e.g. `Tech` matches `Technology`). If the value does not match, the command returns `CATEGORY_NOT_FOUND` with the current available category list. |
| `limit` | No | `20` | Maximum communities to return, from `1` to `100`. |

## Return Value

```json
{
  "section": "recommended",
  "category": null,
  "limit": 20,
  "total": 12,
  "source": "https://www.reddit.com/explore/",
  "subreddits": [
    {
      "rank": 1,
      "name": "learnmachinelearning",
      "display_name": "learnmachinelearning",
      "weekly_visitors": "125K weekly visitors",
      "description": "Learn and stay up-to-date on the fascinating world of machine learning.",
      "permalink": "https://www.reddit.com/r/learnmachinelearning",
      "icon_url": "https://styles.redditmedia.com/..."
    }
  ]
}
```

## Usage

```bash
websculpt reddit discover-subreddits
websculpt reddit discover-subreddits --section popular --limit 10
websculpt reddit discover-subreddits --section curated --limit 5
websculpt reddit discover-subreddits --section category --category Technology --limit 20
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `MISSING_PARAM` | `category` is required when `section=category`. |
| `INVALID_PARAM` | `section` is not one of the allowed values, or `limit` is not an integer between 1 and 100. |
| `CATEGORY_NOT_FOUND` | No sidebar category matched the supplied `category` name; the error message includes the current available category list. |
| `TIMEOUT` | Page navigation timed out. |
| `BLOCKED` | Reddit applied platform rate limiting; log in and retry. |
| `DRIFT_DETECTED` | Expected community cards did not load. |
| `EMPTY_RESULT` | The requested section returned no communities. |
