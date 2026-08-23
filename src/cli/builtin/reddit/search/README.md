# reddit/search

Search Reddit's native public web interface through an attached Chrome session.

## Description

This browser command replaces the unavailable PullPush API path. It opens Reddit's own search page, optionally scoped to a single subreddit, performs bounded low-frequency scrolling with short randomized waits, and extracts post or comment cards from stable `data-testid` hooks. Returned records preserve Reddit tracking context, visible card text, and links alongside normalized fields.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `query` | yes | — | Search keyword or phrase. |
| `subreddit` | no | — | Restrict search to a specific subreddit, e.g. `programming` or `r/programming`. |
| `limit` | no | `20` | Maximum records to return, from 1 through 100. Higher limits require more scrolling and may take tens of seconds. |
| `type` | no | `post` | `post` or `comment`; unsupported values are ignored and reported. |
| `sort` | no | `default` | `default` and `latest` use Reddit `new`; `popular` uses Reddit `top`. |
| `time` | no | `all` | `day`, `week`, `month`, `year`, or `all`; unsupported values are ignored and reported. |

## Return Value

Returns:

```json
{
  "results": [],
  "count": 0,
  "query": "OpenAI",
  "subreddit": null,
  "type": "post",
  "sort": "default",
  "time": "all",
  "limit": 20,
  "maxLimit": 100,
  "ignoredParams": [],
  "truncated": false,
  "paginationComplete": false,
  "partial": false,
  "relevanceUnknown": false,
  "correctedQuery": null,
  "source": "https://www.reddit.com/search/?q=OpenAI&sort=new&t=all",
  "sourceKind": "reddit-native-dom",
  "scrollIterations": 0
}
```

Each result contains `id`, `type`, `title`, `body`, author and subreddit fields, post/comment URLs, visible publication time, visible score/comment counts, Reddit flags where exposed, `partial`, `missingFields`, and a `native` object containing the platform's tracking context, visible text, and links. Fields that Reddit does not render are returned as `null` and listed in `missingFields`.

`paginationComplete` is true only when the requested limit was fulfilled or Reddit explicitly rendered an empty state. `partial` is true when records contain unavailable fields or fewer than the requested number were safely loaded. `relevanceUnknown` is true when Reddit visibly rewrites the query.

## Usage

```bash
websculpt reddit search --query "OpenAI" --limit 5
websculpt reddit search --query "machine learning" --sort popular --time month
websculpt reddit search --query "OpenAI" --type comment --sort popular --time year --limit 10
websculpt reddit search --query "python" --subreddit programming --limit 5
websculpt reddit search --query "beginner" --subreddit r/learnprogramming --sort popular
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `MISSING_PARAM` | `query` was not supplied. |
| `EMPTY_QUERY` | `query` was supplied but empty. |
| `INVALID_PARAM` | `limit` is not a positive integer. |
| `LIMIT_EXCEEDED` | `limit` exceeds 100. |
| `NAVIGATION_FAILED` | Reddit's search page could not be loaded. |
| `ACCESS_RESTRICTED` | Reddit displayed a CAPTCHA, challenge, or block page. |
| `AUTH_REQUIRED` | The browser session must log in before results can be read. |
| `DRIFT_DETECTED` | Expected Reddit result selectors were absent without an explicit empty state. |

## Prerequisite

Keep Chrome open and enable remote debugging at `chrome://inspect/#remote-debugging`. Public search normally needs no Reddit login. Browser automation can still be rate-limited or challenged by Reddit; the command does not bypass those restrictions.
