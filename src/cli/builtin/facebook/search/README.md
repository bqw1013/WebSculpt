# facebook/search

Browser command that searches Facebook using the current browser session and preserves native search payloads.

## Description

Supports the integrated search page plus the pages, groups, people, videos, and events result tabs. It parses Facebook SSR/GraphQL page-data first, serially collects additional response pages when available, and re-navigates before a DOM fallback.

## Parameters

- `query` required search text
- `limit` 1-100, strict
- `type` `top` (综合), `pages` (公共主页), `groups` (小组), `people` (用户), `videos` (视频), or `events` (活动)
- `sort` and `time` are accepted for interface compatibility and reported in `ignoredParams` when non-default

## Return Value

Returns `query`, `type`, `resultCount`, `pagesFetched`, `source`, `fallbackUsed`, `ignoredParams`, `results`, and `nativeEnvelope`. Every result keeps the complete source edge under `native`.

## Usage

```
websculpt facebook search
```

## Common Error Codes

- `MISSING_PARAM`
- `INVALID_PARAM`
- `LIMIT_EXCEEDED`
- `AUTH_REQUIRED`
- `DRIFT_DETECTED`
