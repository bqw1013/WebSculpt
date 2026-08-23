# medium/get-list

Fetch the articles in any public Medium list (a user-curated bookmark collection) by its URL.

## Description

Navigates to the given public Medium list URL, waits for the page's Apollo Client state to hydrate, and extracts list metadata plus article cards. If `--limit` is greater than the initial server-rendered batch, the command scrolls smoothly to trigger Medium's lazy-load GraphQL requests until enough items are loaded or the list is exhausted.

`medium/get-staff-picks` is a specialized wrapper of this command for the official Medium Staff list.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | yes | — | Full URL of a public Medium list, in the form `https://medium.com/@<user>/list/<slug>-<listId>`. |
| `limit` | number | no | 20 | Number of articles to return (1–100). Out-of-range values throw `INVALID_PARAM`. |

## Return Value

```json
{
  "list": {
    "title": "Staff picks",
    "url": "https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f",
    "description": "Stories from across Medium, hand-selected by our team.",
    "curator": {
      "name": "Medium Staff",
      "username": "MediumStaff",
      "profileUrl": "https://medium.com/@MediumStaff"
    },
    "itemCount": 1069,
    "responseCount": 197,
    "clapCount": 19153,
    "clappersCount": 2238,
    "thumbnailImageUrl": "https://miro.medium.com/v2/resize:fit:400/...",
    "createdAt": "2022-04-08T23:18:41.000Z",
    "lastInsertedAt": "2026-08-05T10:29:25.000Z"
  },
  "articles": [
    {
      "rank": 1,
      "title": "Article title",
      "subtitle": "Article subtitle",
      "url": "https://medium.com/@author/article-slug-postId",
      "author": {
        "name": "Author Name",
        "username": "author",
        "profileUrl": "https://medium.com/@author"
      },
      "clapCount": 123,
      "responseCount": 4,
      "readingTimeMinutes": 6,
      "publishedAt": "2026-08-01T12:00:00.000Z",
      "updatedAt": "2026-08-02T12:00:00.000Z",
      "tags": ["tag-one", "tag-two"],
      "previewImageUrl": "https://miro.medium.com/v2/resize:fit:400/...",
      "curatorNote": "Optional note left by the list curator.",
      "isMemberOnly": false
    }
  ],
  "count": 1
}
```

- `partial` is `true` when the requested `--limit` could not be reached because the list was exhausted.

## Usage

```bash
# Default 20 items from a list
websculpt medium get-list --url https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f

# Only the first 5 items
websculpt medium get-list --url https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f --limit 5

# Up to 100 items (scrolls as needed)
websculpt medium get-list --url https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f --limit 100
```

## Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_PARAM` | `--url` is missing or not a valid Medium list URL, or `--limit` is outside 1–100. |
| `NOT_FOUND` | The list does not exist or is not public (Medium 404 or Apollo `NotFound`). |
| `PAGE_LOAD_FAILED` | Page load timed out; Apollo state did not hydrate. |
| `DRIFT_DETECTED` | Expected Apollo `Catalog` / `itemsConnection` structure is missing; Medium's page may have changed. |
| `EMPTY_RESULT` | No valid article data could be extracted from the list. |
