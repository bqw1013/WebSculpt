# quora/search

Reusable browser-backed search command for Quora's public search page.

## Description

`websculpt quora search` searches Quora without opening result detail pages. It reads the page's persisted `SearchResultsListQuery` GraphQL response first, follows cursor pages serially, preserves each native result node, and re-navigates to the target URL for a visible DOM fallback when GraphQL fails.

## Parameters

- `query` (required): search text.
- `limit` (optional, default `20`): strict positive integer from `1` through `100`.
- `type` (optional, default `all`): `all`, `question`, `answer`, `post`, `profile`, `topic`, or `tribe` (the UI's Spaces filter).
- `sort` (optional, default `default`): `default` (relevance) or `latest` (Quora `time_descending`). `popular` is accepted for interface compatibility and is reported in `ignoredParams` because Quora's current menu exposes relevance/recent/least-recent only.
- `time` (optional, default `all`): `all`, `hour`, `day`, `week`, `month`, or `year`.

## Return Value

The JSON envelope includes `query`, `type`, `sort`, `time`, `maxLimit`, `results`, `resultCount`, `pagesFetched`, `source`, and `fallbackUsed`; unsupported standard parameters appear in `ignoredParams`. Each result retains a full `native` GraphQL node plus flattened `id`, `objectId`, `kind`, `title`/`name`, `url`, `content`, `author`, `question`, `publishedAt`, and `metrics`. Type-specific native fields such as Quora qid/aid/pid/uid/tid/tribeId, credentials, images, follower counts, answer counts, upvotes, shares, comments, and space metadata are not discarded.

GraphQL responses use `source: "api"`, `fallbackUsed: false`, and `nativeEnvelope.pages`. DOM fallback responses use `source: "dom"`, `fallbackUsed: true`, and `partial: true`; fields not visible in cards are `null`. A valid no-result page returns an empty `results` array. If both GraphQL and DOM extraction fail, the command throws `DRIFT_DETECTED`.

## Usage

```
websculpt quora search --query "artificial intelligence" --type question --limit 5
```

## Common Error Codes

- `MISSING_PARAM`: `query` was omitted or blank.
- `INVALID_PARAM`: unsupported `type`, `sort`, `time`, or a non-positive/non-integer `limit`.
- `LIMIT_EXCEEDED`: `limit` is greater than `100`.
- `DRIFT_DETECTED`: Quora's GraphQL schema and visible DOM fallback both failed, including an unavailable/expired browser session or Cloudflare challenge that did not complete.

The command does not bypass Cloudflare/Turnstile, generate tokens, open detail pages, or issue parallel fan-out requests. A browser session with Quora access may be required.
