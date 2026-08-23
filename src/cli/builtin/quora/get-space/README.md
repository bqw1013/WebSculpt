# quora/get-space

Fetch metadata and one view of a Quora Space (a community hosted on a subdomain like `https://thestoics.quora.com`).

## Description

This command returns a Space's metadata (name, description, follower/contributor counts, activity summary) plus one of its views:

- `posts` — the default feed, which can be sorted by `top` or `recent`.
- `questions` — questions asked inside the Space.
- `about` — the full Space description/details.
- `contributors` — the Space's contributor list with profile URLs and credentials.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `space` | yes | — | Space slug, the subdomain part of `https://<space>.quora.com`. |
| `section` | no | `posts` | View to return: `posts`, `questions`, `about`, `contributors`. |
| `sort` | no | `top` | Only affects `section=posts`: `top` or `recent`. |
| `limit` | no | `20` | Max items for list-like sections (1–100). Ignored for `about`. |

## Return Value

```json
{
  "space": {
    "name": "Stoicism",
    "url": "https://thestoics.quora.com/",
    "description": "A philosophy designed to make you a wiser...",
    "followerCount": "372.1K",
    "contributorCount": "122",
    "activitySummary": "32 posts in the last week"
  },
  "section": "posts",
  "sort": "top",
  "items": [ ... ],
  "partial": false
}
```

- `items` shape depends on `section`:
  - `posts`: `{ type, isPinned?, author?, publishedAt?, url, upvoteCount?, commentCount?, excerpt? }`
  - `questions`: `{ type, title, url, answerCount?, lastFollowed? }`
  - `about`: `{ details }`
  - `contributors`: `{ name, profileUrl, credential? }`
- `partial=true` means the stream ended before `limit` was reached.

## Usage

```bash
websculpt quora get-space --space thestoics --section posts --sort recent --limit 10
websculpt quora get-space --space science --section about
websculpt quora get-space --space thestoics --section contributors --limit 50
```

## Prerequisites

- Chrome/Edge with remote debugging enabled and a logged-in Quora session.
- Browser attach permission.

## Common Error Codes

- `MISSING_PARAM` — `space` is required.
- `INVALID_PARAM` — unknown `section`/`sort` or `limit` out of range.
- `NOT_FOUND` — the Space subdomain does not exist (Quora redirects to the homepage).
- `DRIFT_DETECTED` — expected selectors were not found; the page structure may have changed.
