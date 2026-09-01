# Context

## Precipitation Background (Why This Command Exists)

Wikipedia is a new domain in the WebSculpt command library. The first batch of commands covered article details, daily feeds, search, categories, news, and trending. Random article discovery was missing, so this command fills that gap for "learn something new" and sampling workflows.

## Value Assessment

- Reusable: random discovery is a recurring need for daily digests and content sampling.
- Stable: backed by the public MediaWiki Action API, which has been stable for years.
- Fast: single HTTP request, no pagination needed for normal limits.
- Low cost: no login, no API key, no browser overhead.

## Page Structure

Primary endpoint:

```text
GET https://{language}.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit={limit}&format=json&origin=*
```

Response path: `query.random[]` with fields `id`, `ns`, `title`.

Article URL pattern:

```text
https://{language}.wikipedia.org/wiki/{encodeURIComponent(title)}
```

## Environment Dependencies

- Requires outbound internet access to `*.wikipedia.org`.
- In restricted network environments, users must provide their own egress path.
- An identifying caller header is sent per MediaWiki guidelines.
- Request pacing: the command makes a single request per invocation; no additional delay loop is needed because the API has no hard anonymous quota.

## Failure Signals

- `NETWORK_ERROR`: connection refused, TLS error, DNS failure, or Wikimedia API-level error response.
- `INVALID_PARAM`: malformed `limit` or `language`.
- `RATE_LIMITED`: HTTP 429 from Wikimedia.
- `EMPTY_RESULT`: API returned zero usable articles after filtering.
- `DRIFT_DETECTED`: `query.random` is missing or entries lack `title`.

## Repair Clues

- If `list=random` is deprecated or removed, the browser fallback `https://{language}.wikipedia.org/wiki/Special:Random` can return a single random article. Title selectors (in order of reliability):
  1. `<h1 id="firstHeading"><span class="mw-page-title-main">{title}</span></h1>`
  2. `<title>{title} - ...</title>`
  3. Inline JS `RLCONF.wgTitle` / `RLCONF.wgPageName`
- For multi-language support, only the hostname `{language}.wikipedia.org` changes; the API path and response structure are identical across editions.
