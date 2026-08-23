# substack/get-profile

Get a single Substack user's public profile by handle.

## Description

This command fetches the public profile of a Substack user. By default it returns profile metadata (name, handle, avatar, bio, publications, subscriber count, follower count). You can also request one of the profile-page sections: `activity`, `posts`, `likes-replies`, or `subscriptions`.

## Parameters

- `--handle` (required): Substack username, i.e. the part after `@` in `https://substack.com/@username`. A leading `@` is accepted and stripped automatically.
- `--section` (optional): Section to return.
  - `profile` (default): profile metadata only.
  - `activity`: all public activity items (posts + notes/replies).
  - `posts`: only published posts.
  - `likes-replies`: public notes/replies (maps to the UI's "Likes & Replies" tab).
  - `subscriptions`: public list of publications the user subscribes to.
- `--limit` (optional): Maximum number of list items to return for section values that produce lists. Range `1-100`, default `20`. Ignored when `section=profile`.

## Return Value

### `section=profile`

```json
{
  "id": "<user-id>",
  "name": "Aaron Rupar",
  "handle": "aaronrupar",
  "avatar_url": "https://...",
  "bio": "...",
  "profile_url": "https://substack.com/@aaronrupar",
  "subscriber_count_string": "<count> subscribers",
  "subscriber_count_number": "<count>",
  "follower_count": "<count>",
  "primary_publication": { "id": "<pub-id>", "name": "Public Notice", "subdomain": "aaronrupar", "custom_domain": "www.publicnotice.co", "logo_url": "https://..." },
  "publications": [...],
  "social_links": [],
  "status": { "bestseller_tier": 10000, "badge": { "type": "bestseller", "tier": 10000 } },
  "source": "api"
}
```

### `section=activity|posts|likes-replies`

```json
{
  "profile": { "id": "<user-id>", "name": "Aaron Rupar", "handle": "aaronrupar", "avatar_url": "...", "profile_url": "https://substack.com/@aaronrupar" },
  "items": [...],
  "next_cursor": "...",
  "source": "api"
}
```

### `section=subscriptions`

```json
{
  "profile": { "id": "<user-id>", "name": "Aaron Rupar", "handle": "aaronrupar", "avatar_url": "...", "profile_url": "https://substack.com/@aaronrupar" },
  "subscriptions": [...],
  "source": "api"
}
```

## Usage

```bash
websculpt substack get-profile --handle aaronrupar
websculpt substack get-profile --handle aaronrupar --section activity --limit 10
websculpt substack get-profile --handle aaronrupar --section subscriptions --limit 5
```

## Common Error Codes

- `MISSING_PARAM`: `--handle` was not provided.
- `INVALID_PARAM`: `--handle`, `--section`, or `--limit` is invalid.
- `NOT_FOUND`: no Substack user with the given handle exists.
- `API_ERROR`: the Substack API returned an unexpected HTTP error.
- `DRIFT_DETECTED`: the API response shape changed and the DOM fallback also failed.
