# medium/get-author

Fetch a Medium author's public profile (name, bio, avatar, follower/following counts) plus one content section of the profile: published stories, reposts, activity, bookmark lists, or the long-form bio. No login required.

## Description

Given a Medium username, the command opens the author's profile page (`https://medium.com/@<username>` or the corresponding tab subpage), extracts profile metadata from the embedded Apollo state, then collects the requested tab:

- **home** (default): the author's stories. The first ~10 items come from the Apollo `homepagePostsConnection` with rich fields (tags, reading time, ISO publish date); further items are lazy-loaded by scrolling and parsed from DOM cards.
- **reposts**: stories the author reposted. Note: Medium only keeps recent reposts, so most profiles return an empty list.
- **activity**: recent public activity (e.g. claps), each entry pairing an activity line (`<name> clapped · <date>`) with the story card it refers to.
- **lists**: public bookmark lists created by the author (name, URL, story count). The Lists tab only exists when the author has public lists.
- **about**: the long-form bio text (`limit` is ignored for this section).

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--username` | yes | - | Medium username without the `@` prefix (a leading `@` is tolerated and stripped). Case-insensitive. |
| `--section` | no | `home` | One of `home` \| `reposts` \| `activity` \| `lists` \| `about`. |
| `--limit` | no | `20` | Max entries for `home`/`reposts`/`activity`/`lists` (1–100). Ignored for `about`. When a stream ends before the limit is reached, the command returns what it found with `partial: true`. |

## Return Value

Common part (always returned):

```json
{
  "username": "umairh",
  "name": "umair haque",
  "bio": "vampire.",
  "avatarUrl": "https://miro.medium.com/v2/resize:fill:176:176/1*N3XzP2bucTYwTm8ZmUZkUA.jpeg",
  "followersCount": 231457,
  "followingCount": 549,
  "profileUrl": "https://medium.com/@umairh",
  "section": "home"
}
```

Then, depending on `section`:

- `home` / `reposts` → `stories: Array<{ postId, title, subtitle, url, author: {name, username, profileUrl}, publication: {name, slug, url} | null, publishedAt (ISO or null), dateText (e.g. "Apr 10", or null), clapCount, responseCount, readingTimeMinutes (or null), tags: string[], previewImageUrl, isMemberOnly, isPinned, source: "apollo" | "dom" }>`. Items with `source: "dom"` (scroll-loaded) have no `publishedAt`/`readingTimeMinutes`/`tags` — those exist only in the Apollo snapshot.
- `activity` → `entries: Array<{ action, actor, dateText, post: <story object as above> }>`.
- `lists` → `lists: Array<{ name, url, storyCount, previewImageUrls: string[] }>`.
- `about` → `about: string` (empty string when the author wrote no long bio).

`partial: true` is added when a list stream was exhausted before reaching `limit`.

## Usage

```bash
# Author profile + latest 20 stories (default)
websculpt medium get-author --username umairh

# Up to 50 stories from the home tab
websculpt medium get-author --username umairh --section home --limit 50

# Bookmark lists created by Medium Staff
websculpt medium get-author --username MediumStaff --section lists

# Recent activity
websculpt medium get-author --username MediumStaff --section activity --limit 10

# Long-form bio
websculpt medium get-author --username umairh --section about
```

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. No login required. Member-only content is limited to its free preview.

## Common Error Codes

- `MISSING_PARAM` — `--username` not provided.
- `INVALID_PARAM` — invalid username characters, unknown `--section`, or `--limit` outside 1–100 (checked before any page access).
- `NOT_FOUND` — user does not exist (page says PAGE NOT FOUND / no matching profile node) or the account is suspended.
- `PAGE_LOAD_FAILED` — the page's Apollo state did not hydrate within 15s.
