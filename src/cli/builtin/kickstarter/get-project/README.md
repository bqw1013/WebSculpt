# kickstarter/get-project

## Description

Return a Kickstarter project's full detail from a project URL or `creator/slug`.

Runs in the browser because Kickstarter blocks node/curl HTTP clients with a Cloudflare managed challenge. It loads the real project page in the attached Chrome, reads `window.current_project.data`, and issues in-page `POST /graph` requests (Campaign query for story/risks; CommentsQuery / PostsFeed when the corresponding flags are on). No login is required, but the browser's existing Kickstarter session (if any) is reused.

## Parameters

| Name | Required | Default | Description |
|---|---|---|---|
| `url` | yes | — | Project URL (`https://www.kickstarter.com/projects/{creator}/{slug}`) or `creator/slug` short form |
| `include_comments` | no | `false` | Load the comments tab via GraphQL CommentsQuery |
| `comment_limit` | no | `25` | Number of top-level comments to load (1-100) |
| `include_updates` | no | `false` | Load the updates tab via GraphQL PostsFeed timeline |
| `update_limit` | no | `10` | Number of timeline items (updates) to load (1-100) |

## Return Value

```json
{
  "project": {
    "id": 673793231, "name": "101 Artists, Vol. 1", "slug": "wmartbook",
    "url": "https://www.kickstarter.com/projects/wraithmarked/wmartbook", "blurb": "...",
    "state": "live", "goal": 10000, "pledged": 64305, "currency": "USD",
    "usd_pledged": 64305, "percent_funded": 643, "backers_count": 760,
    "launched_at": 1786453247, "deadline": 1787954400,
    "creator": { "id": 1859399916, "name": "Wraithmarked Creative", "slug": "wraithmarked" },
    "location": { "name": "Rochester, NY", "country": "US", "state": "NY", "type": "Town" },
    "category": { "id": 45, "name": "Art Books", "slug": "publishing/art books", "parent_id": 18, "parent_name": "Publishing" },
    "tags": ["Superbacker Launches"],
    "rewards": [ { "id": 11323478, "minimum": 10, "backers_count": 2, "title": "Vol. 1 Deluxe Foil Bookmark" } ],
    "comments_count": 27, "updates_count": 2,
    "story": "<html...>", "risks": "text...",
    "stats": { "backers_count": 760, "pledged": "64305.0", "comments_count": 27, "comments_for_display_count": 9 }
  },
  "comments": { "commentsCount": 9, "items": [ ... ], "hasNextPage": false, "endCursor": "..." },
  "updates": { "totalCount": 3, "items": [ ... ], "hasNextPage": false, "endCursor": "..." }
}
```

- `percent_funded` is derived as `round(pledged/goal*100)` (not present in `current_project.data`).
- `story` and `risks` come from the `Campaign` GraphQL query (not embedded in the page).
- `comments` appears only when `--include_comments` is on; `updates` only when `--include_updates` is on.

## Usage

```
websculpt kickstarter get-project --url https://www.kickstarter.com/projects/wraithmarked/wmartbook
websculpt kickstarter get-project --url wraithmarked/wmartbook --include_comments --comment_limit 5
websculpt kickstarter get-project --url mulsow/pontos --include_updates --update_limit 5
```

## Common Error Codes

- `MISSING_PARAM` — required `url` not provided.
- `INVALID_PARAM` — `url` cannot be parsed as a project URL or `creator/slug`; or `comment_limit`/`update_limit` is not a positive integer.
- `NOT_FOUND` — project does not exist (404 page; `window.current_project` absent). Checked before platform-block detection.
- `PLATFORM_BLOCKED` — Cloudflare challenge page detected, or `/graph` returned non-JSON (challenge) HTML.
- `DRIFT_DETECTED` — page structure changed: `current_project.data` missing on a non-404 page, csrf-token meta missing, or GraphQL returned field-level errors.
