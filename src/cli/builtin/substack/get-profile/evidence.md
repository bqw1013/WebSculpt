# Evidence: substack/get-profile

This document records the research and validation evidence for the `substack/get-profile` command.

## Exploration Path

- Checked the WebSculpt command library: no existing command returns a single Substack user profile. `substack/search` can find people but does not expose the full profile object or the profile-page sections.
- Read the WebSculpt browser runtime guide and capture contract.
- Verified browser connectivity with an existing Substack command before exploration.
- Used a Playwright CLI session to create an independent tab and navigate to profile pages. Did not reuse or close user-owned tabs.
- Identified the public API used by Substack's own search:
  - `GET https://substack.com/api/v1/profile/search?query=<handle>&page=0`
- Identified the public activity feed endpoint used by profile tabs:
  - `GET https://substack.com/api/v1/reader/feed/profile/<user_id>`
- Validated the endpoints with the handles `aaronrupar` and a non-existent handle.

## Verified URLs

- https://substack.com/explore
- https://substack.com/@aaronrupar
- https://substack.com/search/nonexistent_xyz_abc_12345?searching=profile
- https://substack.com/api/v1/profile/search?query=aaronrupar&page=0
- https://substack.com/api/v1/reader/feed/profile/<user-id>
- https://www.publicnotice.co/

## Structural Evidence

### Profile search API

`GET /api/v1/profile/search?query=<handle>&page=0`

Response shape:

```json
{
  "results": [
    {
      "id": <user-id>,
      "name": "Aaron Rupar",
      "handle": "aaronrupar",
      "bio": "...",
      "photo_url": "https://...",
      "profile_set_up_at": "2021-09-28T14:12:18.343Z",
      "subscriberCount": "<count>",
      "subscriberCountNumber": <count>,
      "followerCount": <count>,
      "primaryPublication": { "id": <pub-id>, "name": "Public Notice", "subdomain": "aaronrupar", "custom_domain": "www.publicnotice.co" },
      "publicationUsers": [
        { "is_primary": true, "publication": { "id": <pub-id>, "name": "Public Notice", "subdomain": "aaronrupar" } }
      ],
      "subscriptions": [ { "name": "...", "publication": "..." } ],
      "userLinks": [],
      "status": { "bestseller_tier": 10000, "badge": { "type": "bestseller", "tier": 10000 } }
    }
  ]
}
```

The search is fuzzy, so the command must filter `results` for an exact `handle` match.

### Activity feed API

`GET /api/v1/reader/feed/profile/<user_id>`

Response shape:

```json
{
  "items": [
    { "type": "post", "context": { "type": "post", "timestamp": "..." }, "post": { "title": "...", "slug": "..." }, "publication": { "name": "...", "subdomain": "..." } },
    { "type": "comment", "context": { "type": "note", "timestamp": "..." }, "comment": { "body": "..." } }
  ],
  "nextCursor": "..."
}
```

- `Posts` tab corresponds to `type === 'post'`.
- `Likes & Replies` tab corresponds to `type === 'comment'` (public notes/replies).
- `Activity` tab shows all items.
- Server-side `?type=...` and `?limit=...` parameters are ignored; pagination uses `?cursor=<nextCursor>`.

### Profile-page DOM fallback

- URL format: `https://substack.com/@<handle>`.
- Contains JSON-LD `Person` schema with `name`, `image`, `url`, `jobTitle`/`description`.
- Header text includes subscriber count (e.g. `<count> subscribers`) linked to `/@<handle>/subscribers`.
- Non-existent handles redirect to `/search/<handle>?searching=profile`.

## Failure Signals

- `results` array missing or no exact `handle` match → `NOT_FOUND`.
- Profile page redirect to `/search/...` → `NOT_FOUND`.
- JSON-LD `Person` missing on DOM fallback → `DRIFT_DETECTED`.
- Unexpected API response shape on both API and DOM paths → `DRIFT_DETECTED`.
- Missing `handle` parameter → `MISSING_PARAM`.
- Invalid `section` value → `INVALID_PARAM`.
- Invalid `limit` value (non-integer, < 1, > 100) → `INVALID_PARAM`.

## Capture Assessment

This command should be captured. The API-first path is stable, returns structured data, and covers both default profile metadata and the optional profile-page sections. A DOM fallback is available if the API shape drifts. No login is required.
