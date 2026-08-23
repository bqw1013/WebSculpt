# reddit/search-subreddits

Search Reddit communities (subreddits) by keyword.

## Description

This command opens Reddit's community search (`/search/?q=<query>&type=communities`) in an attached browser, extracts the matching community cards, and returns a structured list.

## Parameters

- `--query <value>` (required): Search keyword or phrase.
- `--limit <value>` (optional): Maximum number of communities to return. Range `1-100`, default `20`.

## Return Value

```json
{
  "query": "python",
  "limit": 20,
  "total": 20,
  "source": "https://www.reddit.com/search/?q=python&type=communities",
  "subreddits": [
    {
      "subreddit_id": "t5_2qh0y",
      "name": "Python",
      "display_name": "Python",
      "subreddit": "r/Python",
      "description": "The largest Python community for Reddit! ...",
      "nsfw": false,
      "quarantined": false,
      "weekly_visitors": "117K",
      "weekly_visitors_raw": 117139,
      "weekly_contributions": "1.4K",
      "weekly_contributions_raw": 1413,
      "permalink": "https://www.reddit.com/r/Python/",
      "icon_url": "https://styles.redditmedia.com/..."
    }
  ],
  "truncated": false,
  "scrollIterations": 2
}
```

### Field notes

- `subreddit_id`: Reddit's internal id, e.g. `t5_2qh0y`.
- `name`: Subreddit name without the `r/` prefix.
- `display_name`: Display name as shown in the card.
- `subreddit`: Qualified name, e.g. `r/Python`.
- `nsfw` / `quarantined`: Taken from the card's telemetry context.
- `weekly_visitors` / `weekly_contributions`: Formatted strings shown on the card.
- `weekly_visitors_raw` / `weekly_contributions_raw`: Raw integer values from the underlying `faceplate-number` element. May be `null` if the number is not rendered.
- `members`, `subscriber_count`, `created`, `banner_url`, `is_user_subscribed`, `rules`, and `topic` are **not exposed** on the community search card and are therefore not returned.

## Usage

```
websculpt reddit search-subreddits --query python
websculpt reddit search-subreddits --query "machine learning" --limit 10
```

## Common Error Codes

- `MISSING_PARAM`: `--query` was not provided.
- `INVALID_PARAM`: `--limit` is not an integer between 1 and 100.
- `TIMEOUT`: Page navigation timed out.
- `BLOCKED`: Reddit applied platform rate limiting.
- `DRIFT_DETECTED`: The expected community cards or Communities tab did not load.
- `EMPTY_RESULT`: No communities were found for the query.

## Polite Pacing Measures

The command uses conservative, randomized delays to keep a polite pacing profile:

- After page navigation: 200–500 ms.
- After the Communities tab is confirmed: 200–500 ms.
- Between infinite-scroll loads: 300–800 ms.
- Before returning results: 0–500 ms.
- Mouse movements are small (±30 px) and triggered at 50% probability on entry and 15% probability during scrolling.

If you encounter `BLOCKED` or 403/429 responses, increase local wait times or log in to Reddit in the attached browser before retrying.

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. Does not require a Reddit login.
