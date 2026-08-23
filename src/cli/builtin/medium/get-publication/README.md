# medium/get-publication

Fetch a Medium publication's metadata and article list by slug. A publication is Medium's multi-author, magazine-like space (e.g. https://medium.com/grepsr-blog).

## Description

Returns publication metadata (name, tagline, description, follower count, avatar, navigation items) plus one article section:

- `section=home` (default): the curated homepage selection, in editorial order. Each article is tagged with the homepage section it appeared in (e.g. "Latest", "From the Archives").
- `section=all`: the full story stream in the order Medium lists it on `https://medium.com/<slug>/all` — newest *listed* first (`/<slug>/latest` redirects there). Note the sort key is the story's listing date in the publication, so `publishedAt` values are not guaranteed to be monotonically decreasing (a story published earlier can be listed later).

Data is fetched from Medium's own GraphQL endpoint (`POST /_/graphql`, the one the site itself uses for scroll-loading), so every article carries full metadata: title, subtitle, author, publish/update dates, clap and response counts, reading time, preview image and a member-only flag. Publications hosted on custom domains (e.g. better-programming → betterprogramming.pub) are handled automatically via redirect.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--slug` | yes | - | Publication slug — the first path segment of `https://medium.com/<slug>`. Letters, digits, hyphens. Examples: `grepsr-blog`, `ux-planet`, `better-programming`, `data-science-collective`. |
| `--section` | no | `home` | `home` = curated homepage selection; `all` = full chronological stream. |
| `--limit` | no | `20` | Max articles to return (1-100). If the stream/list ends earlier, you get what exists with `partial: true`. |

## Return Value

```json
{
  "publication": {
    "id": "5ce667e721ce",
    "name": "Grepsr Blog",
    "slug": "grepsr-blog",
    "url": "https://medium.com/grepsr-blog",
    "domain": "",
    "tagline": "A collection of stories, case studies, and product announcements from Grepsr.",
    "description": "A collection of stories, case studies, engineering experiences and product announcements from Grepsr.",
    "followersCount": 56,
    "avatarUrl": "https://miro.medium.com/v2/resize:fit:140/1*H8cPFPXkt1kiImIu3Ynu_w.png",
    "navigationItems": [{ "title": "Knowledge Base", "value": "knowledge-base", "destination": "TAG_FEED" }]
  },
  "section": "all",
  "count": 20,
  "partial": false,
  "articles": [
    {
      "id": "5a8b81c74579",
      "title": "Web Scraping Best Practices for RPA Integration",
      "subtitle": "The new era of RPA- a shift from manual hard work to automated smart work in business.",
      "url": "https://medium.com/grepsr-blog/web-scraping-best-practices-for-rpa-integration-5a8b81c74579",
      "author": {
        "name": "Grepsr",
        "username": "grepsr",
        "profileUrl": "https://medium.com/@grepsr",
        "avatarUrl": "https://miro.medium.com/v2/resize:fit:64/1*sy_bq2oBDtRCg43IwVkXrw.png"
      },
      "publishedAt": "2026-08-03T11:08:47.102Z",
      "updatedAt": "2026-08-03T11:08:47.102Z",
      "clapCount": 0,
      "responseCount": 0,
      "readingTimeMinutes": 4,
      "previewImageUrl": "https://miro.medium.com/v2/resize:fit:400/0*BZRFhW5lE3iZWdo9.jpg",
      "isMemberOnly": false
    }
  ]
}
```

Notes:

- `partial: true` is only present when the requested `limit` could not be fully satisfied because the stream/list ended.
- With `section=home`, each article additionally has `tags` (string array) and `section` (homepage section name, may be empty).
- `author.username` and article `url` chain directly into `medium/get-author` and `medium/get-article`.

## Usage

```
websculpt medium get-publication --slug grepsr-blog
websculpt medium get-publication --slug ux-planet --section home --limit 30
websculpt medium get-publication --slug better-programming --section all --limit 100
```

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. No login required. Member-only content is limited to its free preview.

## Common Error Codes

| Code | Meaning |
|---|---|
| `MISSING_PARAM` | `--slug` was not provided. |
| `INVALID_PARAM` | `slug` contains illegal characters, `section` is not `home`/`all`, or `limit` is not an integer in 1-100. The message lists the valid values. |
| `NOT_FOUND` | No publication resolves for the slug (Medium 404 page, or GraphQL returned null). Publications that moved off Medium to their own site (e.g. `towards-data-science`) also produce this. |
| `EMPTY_RESULT` | The publication exists but no articles could be extracted (e.g. empty homepage curation). |
| `PAGE_LOAD_FAILED` | The page did not hydrate its Apollo state within the timeout. |
| `API_REQUEST_FAILED` | Medium's GraphQL endpoint returned a non-200 HTTP status. |
| `DRIFT_DETECTED` | Medium changed its GraphQL schema or page structure; the command needs repair. |
