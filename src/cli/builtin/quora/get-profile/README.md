# quora/get-profile

Fetch a Quora user's public profile metadata and one content section.

## Description

This command attaches to your Chrome/Edge session, navigates to a Quora profile page (`https://www.quora.com/profile/<name>`), and extracts the user's public metadata plus one content tab. It is useful after discovering a user via `websculpt quora search --type profile`.

## Parameters

- `--name` (required): Quora username, the last segment of the profile URL. Example: `Hector-Quintanilla`.
- `--section` (optional, default `profile`): Which tab to return.
  - `profile` — metadata + default recent-activity feed
  - `answers` — user's answers
  - `questions` — user's questions
  - `posts` — user's Space-hosted posts
  - `followers` — user's followers
  - `following` — **Spaces the user follows** (not users)
  - `log` — public edit/activity log
- `--limit` (optional, default `20`): Maximum list items (1–100). Ignored for `section=profile`.

## Return Value

```json
{
  "profile": {
    "name": "Hector Quintanilla",
    "profileUrl": "https://www.quora.com/profile/Hector-Quintanilla",
    "credential": "Top Business Writer in Quora",
    "bio": "Free resources and exclusive insights: #BeBusinessSmart #JesusFollower",
    "followerCount": 199995,
    "followingCount": 334,
    "counts": { "answers": 1500, "questions": 87, "posts": 718 },
    "totalContentViews": "138.9M",
    "monthlyContentViews": "135.3K",
    "joinDate": "August 2013",
    "knownLanguages": ["Spanish"],
    "credentials": [...],
    "activeSpaces": [...],
    "isPublishedWriter": true
  },
  "section": "answers",
  "items": [...],
  "count": 20,
  "partial": false
}
```

`items` shape depends on `--section`:

- `answers`: `{questionTitle, questionUrl, answerUrl, publishedAt, upvoteCount, commentCount, shareCount, excerpt, isPinned}`
- `questions`: `{title, url, answerCount, lastFollowedAt}`
- `posts`: `{spaceName, spaceUrl, postUrl, title, excerpt, publishedAt, upvoteCount, commentCount}`
- `followers`: `{name, profileUrl}`
- `following`: `{spaceName, spaceUrl, followerCount, description}`
- `log`: `{action, targetTitle, targetUrl, text, publishedAt}`
- `profile`: mixed recent activity with `type` field

## Usage

```bash
websculpt quora get-profile --name Hector-Quintanilla
websculpt quora get-profile --name Hector-Quintanilla --section answers --limit 10
websculpt quora get-profile --name Hector-Quintanilla --section following --limit 5
```

## Common Error Codes

- `MISSING_PARAM` — `--name` is required.
- `INVALID_PARAM` — invalid `--section` or `--limit` out of 1–100.
- `NOT_FOUND` — profile/section does not exist (Quora shows "Page Not Found").
- `DRIFT_DETECTED` — expected content did not render, possibly due to Quora layout changes or rate limiting.
- `BROWSER_ATTACH_REQUIRED` — Chrome/Edge remote debugging is not enabled.

## Notes

- A logged-in Quora session is recommended. Anonymous access may hit login prompts or rate limits.
- The command includes randomized waits, mouse movement, and scrolling to behave like a real user.
- Quora loads list content lazily; the command waits for representative elements before extracting.
