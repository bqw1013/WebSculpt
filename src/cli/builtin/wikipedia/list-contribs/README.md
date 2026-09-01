# wikipedia/list-contribs

List a Wikipedia user's recent contributions.

## Description

This command queries the public MediaWiki Action API and returns a user's recent edits. Each contribution includes as many available fields as possible: revision ID, parent revision ID, timestamp, article title, namespace, edit summary, post-edit byte size, byte change, tags, and article URL.

## Parameters

- `user` (required): Wikipedia username or full user page URL.
- `limit` (optional): Maximum number of contributions to return. Must be a positive integer. The API returns up to 500 items per request; larger values are fetched across multiple pages. Default: `20`.
- `language` (optional): MediaWiki language code. Default: `zh`.

## Return Value

```json
{
  "user": "{user}",
  "language": "zh",
  "count": 20,
  "contribs": [
    {
      "revid": 123456789,
      "parentid": 123456788,
      "timestamp": "2026-08-30T16:15:09Z",
      "title": "{article title}",
      "ns": 0,
      "comment": "{edit summary}",
      "size": 15236,
      "sizediff": -3351,
      "tags": ["{tag}"],
      "url": "https://{lang}.wikipedia.org/wiki/{article title}"
    }
  ]
}
```

Fields with no value are omitted from each contribution object.

## Usage

```bash
websculpt wikipedia list-contribs --user "{user}"
websculpt wikipedia list-contribs --user "{user}" --limit 50
websculpt wikipedia list-contribs --user "https://en.wikipedia.org/wiki/User:{user}" --language en --limit 100
```

## Common Error Codes

- `INVALID_PARAM`: Missing or invalid parameter.
- `EMPTY_RESULT`: The user has no visible contributions.
- `NETWORK_ERROR`: Cannot reach Wikipedia (often caused by missing suitable egress path in restricted network environments).
- `RATE_LIMITED`: Wikipedia rate limit encountered (defensive, rarely observed).
- `DRIFT_DETECTED`: The API response structure changed unexpectedly.
