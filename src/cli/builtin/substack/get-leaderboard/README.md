# substack/get-leaderboard

Get Substack author leaderboards.

## Description

Returns a ranked list of authors/publications from Substack leaderboards. By default it returns the global **New Bestsellers** list. You can also request a specific category leaderboard or the personalized **For You** list.

## Usage

```bash
# Global New Bestsellers (default), top 25
websculpt substack get-leaderboard

# Technology category, top 10
websculpt substack get-leaderboard --category technology --limit 10

# Business category, top 100
websculpt substack get-leaderboard --category business --limit 100

# Personalized For You (requires login)
websculpt substack get-leaderboard --category for-you --limit 50
```

## Parameters

- `--category` string, optional, default `new-bestsellers`
  - `new-bestsellers`: global New Bestsellers.
  - `for-you`: personalized recommendations (requires login).
  - Any category slug, e.g. `technology`, `business`, `finance`, `culture`, `news`, `science`, `world-politics`, `food`, `podcast`, `sports`, `art`, `health-politics`, `fashionandbeauty`, `music`, `faith`, `climate`, `literature`, `fiction`, `health`, `design`, `travel`, `parenting`, `comics`, `international`, `crypto`, `humor`, `education`, `film-and-tv`, `home-garden`.
- `--limit` number, optional, default `25`, max `200`
  - Controls how many entries to return. The command fetches API pages internally until the limit is reached or no more data is available.

## Output

Array of leaderboard entries:

```json
[
  {
    "rank": 1,
    "author": "Dylan Patel",
    "handle": "semianalysis",
    "author_url": "https://substack.com/@semianalysis",
    "publication": "SemiAnalysis",
    "publication_url": "https://newsletter.semianalysis.com",
    "avatar_url": "https://...",
    "subscriber_count": 306000,
    "subscriber_count_text": "Thousands of paid subscribers"
  }
]
```

## Prerequisites

- Chrome with remote debugging enabled (`chrome://inspect/#remote-debugging`).
- `--category for-you` requires you to be logged into Substack in that Chrome instance.

## Errors

- `AUTH_REQUIRED`: returned when requesting `--category for-you` without an active Substack login.
- `INVALID_PARAM`: unknown category slug or invalid limit.
- `EMPTY_RESULT`: API returned no items.
- `BROWSER_ATTACH_REQUIRED`: Chrome remote debugging is not available.
