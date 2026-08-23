# substack/search

Generated draft for a `browser` runtime command.

## Description

Search Substack's public search views from the attached browser session. The command uses the verified Substack API first and preserves the native response fields. It applies light randomized pacing between browser requests, then falls back to visible DOM results when the API request or response shape fails. DOM fallback is marked as partial.

## Parameters

- `query` (required): search keyword.
- `limit` (optional, default `20`): maximum number of records, from `1` through `100`.
- `type` (optional, default `top`): one of `top`, `recent`, `posts`, `publications`, or `people`.
- `sort` (optional, default `default`): Substack has no verified sort control; non-default values are ignored and reported in `ignoredParams`.
- `time` (optional, default `all`): Substack has no verified time-range control; non-all values are ignored and reported in `ignoredParams`.

The command does not expose Substack's internal page number or cursor. It follows those internally for all views until the requested limit is reached or the platform reports no more results, with a bounded six-request safety cap. The mixed Top response is kept in its verified native envelope.

## Return Value

API success returns the native Substack envelope with `source: "api"`, `fallbackUsed: false`, and `maxLimit: 100`. `top` and `recent` use an `items` array; `posts`, `publications`, and `people` use a `results` array. Native pagination and tracking metadata are retained. Unsupported `sort`/`time` requests are listed in `ignoredParams`.

When the API is unavailable or its schema drifts, DOM fallback returns the visible records with `source: "dom"`, `fallbackUsed: true`, and `partial: true`. DOM fallback records contain only fields visible on the page, such as `url`, `title`, `name`, `handle`, `description`, and `text`.

## Usage

```
websculpt substack search --query "artificial intelligence"
websculpt substack search --query "machine learning" --type posts --limit 10
websculpt substack search --query "writing" --type people --limit 5
```

## Common Error Codes

- `MISSING_PARAM`: `query` was omitted or empty.
- `INVALID_PARAM`: `type` is not supported or `limit` is not a positive integer.
- `LIMIT_EXCEEDED`: `limit` is above the Substack command maximum of `100`.
- `DRIFT_DETECTED`: both the API response and the visible DOM fallback failed to produce extractable results.
- `BROWSER_ATTACH_REQUIRED`: the WebSculpt daemon could not attach to Chrome; enable remote debugging and keep Chrome open.
