# medium/search

## Description

Search public Medium posts, people, publications, topics, and lists by query while preserving detailed native result fields.

Search public Medium content from an attached browser session. The command uses Medium's same-origin GraphQL search path first, follows `pagingInfo.next` internally, and falls back to visible search-page DOM extraction when navigation, transport, JSON, or schema validation fails. It never opens result detail pages or performs write actions.

## Parameters

- `query` (required): search text.
- `limit` (default `20`, max `100`): strict positive integer result cap.
- `type` (default `posts`): `posts`, `people`, `publications`, `topics`, or `lists`.
- `sort` (default `default`): `default`, `latest`, or `popular`. Medium exposes no stable public sort mapping for this command, so non-default values are accepted and returned in `ignoredParams`.
- `time` (default `all`): `all`, `day`, `week`, `month`, or `year`. Medium exposes no stable public time mapping, so non-all values are returned in `ignoredParams`.

## Return Value

The JSON envelope includes `query`, `type`, `sort`, `time`, `maxLimit`, `results`, `resultCount`, `pagesFetched`, `source`, `fallbackUsed`, and `nativeEnvelope`. API results preserve the native Medium GraphQL objects. Post results include IDs, title, canonical Medium URL, author, publication, tags, preview image, subtitle, publication timestamps, reading time, clap count, response count, lock/publish state, and other fields returned by the platform. People, publication, topic, and list results retain their native IDs and metadata.

DOM fallback responses are marked `source: "dom"`, `fallbackUsed: true`, and `partial: true`; fields not visible in the search card are `null`.

## Usage

```text
websculpt medium search --query "artificial intelligence" --type posts --limit 20
websculpt medium search --query "machine learning" --type people --limit 10
```

## Common Error Codes

- `MISSING_PARAM`: `query` was omitted or blank.
- `INVALID_PARAM`: invalid `type`, `sort`, `time`, or non-integer/ non-positive `limit`.
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `DRIFT_DETECTED`: GraphQL and visible DOM extraction both failed or the page structure changed.

## Browser and pacing

Requires the WebSculpt browser runtime with the user's existing Chrome/CDP session. Requests are serial, page navigation waits and pagination waits are randomized in short ranges, and fallback performs one low-amplitude pointer/scroll nudge. The command does not bypass CAPTCHA, 403, or 429 responses.
