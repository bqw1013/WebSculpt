# devto/list-articles

List articles from DEV.to. This command prefers the public Forem API and falls back to browser extraction when the API returns an error or cannot be reached.

## Description

Retrieve a list of DEV.to articles. You can filter by tag, user, or organization, choose a sort order, and request a specific time period for top articles. The command returns structured data with a `source` field indicating whether the result came from the API or the browser fallback.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `sort`    | no       | `popular` | Sort order: `popular`, `latest`, or `top`. |
| `period`  | no       | `infinity` | Time window for `top`: `week`, `month`, `year`, or `infinity`. API only. |
| `tag`     | no       | —       | Filter by a single tag, e.g. `{tag}`. |
| `user`    | no       | —       | Filter by a username, e.g. `{user}`. |
| `org`     | no       | —       | Filter by an organization username, e.g. `{org}`. |
| `limit`   | no       | `30`    | Maximum number of articles (1–1000). |

Only one of `tag`, `user`, or `org` may be provided at a time.

## Return Value

```json
{
  "source": "api" | "browser",
  "articles": [
    {
      "title": "string",
      "url": "string",
      "path": "string",
      "published_at": "string",
      "reading_time_minutes": 0,
      "tags": ["string"],
      "comments_count": 0,
      "public_reactions_count": 0,
      "author": { "name": "string", "username": "string", "profile_image": "string" },
      "organization": { "name": "string", "username": "string", "profile_image": "string" }
    }
  ]
}
```

Fields that are unavailable from the current source are omitted. For example, the browser fallback may not expose `id`, `description`, or exact reaction counts on tag pages.

## Usage

```bash
# Site-wide popular articles
websculpt devto list-articles

# Latest articles
websculpt devto list-articles --sort latest

# Top articles this week
websculpt devto list-articles --sort top --period week

# Articles from a tag
websculpt devto list-articles --tag {tag}

# Articles from a user
websculpt devto list-articles --user {user}

# Articles from an organization
websculpt devto list-articles --org {org}

# Limit results
websculpt devto list-articles --tag {tag} --limit 10
```

## Common Error Codes

- `INVALID_PARAM` — invalid or conflicting parameters.
- `NOT_FOUND` — the requested user, organization, or tag does not exist.
- `EMPTY_RESULT` — the target exists but has no articles.
- `RATE_LIMITED` — the API returned a 429 response and the browser fallback also failed.
- `NETWORK_ERROR` — the API returned a server error or the request could not complete.
- `BROWSER_ATTACH_REQUIRED` — browser fallback was needed but browser remote debugging is not available.
