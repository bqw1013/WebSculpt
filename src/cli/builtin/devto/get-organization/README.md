# devto/get-organization

Fetch a DEV.to organization's public profile by username.

## Description

This command returns the public profile of a DEV.to organization. It first calls the public Forem API. If the API returns a rate-limit response or another critical failure, the command falls back to loading the organization's DEV.to page and extracting the same information from the rendered HTML.

The output includes a top-level `source` field (`"api"` or `"browser"`) so callers know which path produced the result.

## Parameters

- `org` (required): Organization username, the profile URL path segment (`https://dev.to/<org>`). Case-insensitive; normalized to lowercase.
- `include_members` (optional, default `false`): Also return the organization's member list. In API mode this is the full public member list. In browser fallback mode only the first 50 visible member avatars are returned, with `username` and `profile_image` only.

## Return Value

On success, an object like:

```json
{
  "source": "api",
  "id": 123,
  "username": "{org}",
  "name": "Organization Name",
  "summary": "...",
  "tag_line": "...",
  "tech_stack": "...",
  "url": "https://example.com",
  "profile_image": "https://dev.to/...",
  "location": "...",
  "twitter_username": "...",
  "github_username": "...",
  "joined_at": "ISO-8601",
  "members": [ ... ]
}
```

In browser fallback mode the shape is similar, but:

- `id` is not available.
- `url` is the canonical profile page URL (`https://dev.to/{org}`).
- `website`, `twitter`, and `github` are returned as full URLs rather than usernames.
- `members` contains up to 50 objects with `username` and `profile_image` only.

Null or undefined fields are omitted from the output.

## Usage

```
websculpt devto get-organization --org {org}
websculpt devto get-organization --org {org} --include_members true
```

## Common Error Codes

- `INVALID_PARAM`: `--org` is missing or invalid.
- `NOT_FOUND`: The organization does not exist (404 from API or browser page).
- `EMPTY_RESULT`: The API returned an unexpected empty body, or the browser page structure could not be read.
- `RATE_LIMITED`: The DEV.to API returned HTTP 429.
- `NETWORK_ERROR`: A network failure occurred and the browser fallback also failed to load the page.
- `BROWSER_ATTACH_REQUIRED`: The command requires an attached browser with remote debugging enabled, but no browser session is available.
