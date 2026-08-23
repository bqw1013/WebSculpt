# producthunt/get-trending

Fetch the daily trending products leaderboard from Product Hunt.

## Description

This command retrieves the daily trending products from Product Hunt. By default it fetches today's leaderboard; if today's data has not yet been published (common in non-Pacific timezones), it **automatically falls back to yesterday**. A specific historical date can also be requested via `--date`. Each product includes its rank, title, tagline, upvote count, topic tags, slug, and full URL. No authentication is required.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `date` | string | No | today (auto-fallback to yesterday) | Leaderboard date in `YYYY-MM-DD` format. Omit to fetch today's ranking with automatic fallback to yesterday. |
| `limit` | number | No | 20 | Maximum number of products to return. |

## Return Value

```typescript
{
  date: string;        // The effective YYYY-MM-DD that was fetched (may differ from "today" due to auto-fallback)
  url: string;         // The page URL that was scraped
  items: Array<{
    rank: number | null;
    title: string;
    tagline: string;
    votes: number | null;
    topics: string[];
    slug: string;
    url: string;
  }>;
  count: number;
}
```

## Usage

```bash
# Today's leaderboard (default)
websculpt producthunt get-trending

# Today's leaderboard, top 10 only
websculpt producthunt get-trending --limit 10

# Historical date
websculpt producthunt get-trending --date 2026-06-01

# Historical date, top 5
websculpt producthunt get-trending --date 2026-06-01 --limit 5
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `DRIFT_DETECTED` | The page structure has changed and product cards could not be found. |
| `EMPTY_RESULT` | The page loaded but contained no product cards (e.g., a future date or a date with no launches). |
