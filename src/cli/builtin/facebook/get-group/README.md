# facebook/get-group

Fetch a Facebook Group's info (name, member count, privacy, about text) and its post feed.

## Description

Reads a Facebook Group detail page (`facebook.com/groups/{group}/`) and returns the group header (name, members, privacy, about) plus a scroll-loaded post feed. `group` accepts a numeric group ID or a vanity name. Public groups are readable without joining; private groups require membership (otherwise `posts` is empty and `privacy` is `"private"`). The returned post `permalink` preserves the raw feed anchor `/groups/{group}/posts/{postId}/`, which can be fed directly to `facebook/get-post` for full text and comments. Requires an active Facebook login in the attached browser.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `group` | string | yes | - | Numeric group ID or vanity name, the segment in `facebook.com/groups/{group}/`. Find it in the address bar, or use `facebook/search --type groups`. (小组数字 ID 或 vanity 名) |
| `limit` | number | no | 20 | Maximum posts to return (1-100). The feed loads more posts on scroll and virtualizes the DOM, so the command scrolls internally and extracts incrementally; `partial: true` when the stream is exhausted before reaching the limit. (帖子数量上限，滚动加载、边滚边提取) |

## Return Value

```json
{
  "name": "Traveling The World ✈️",
  "url": "https://www.facebook.com/groups/travelingtheworlds/",
  "members": 345000,
  "privacy": "public",
  "about": "Join 328k+ travelers ... 展开",
  "posts": [
    {
      "author": { "name": "A Group Member", "url": "https://www.facebook.com/groups/{groupId}/user/{userId}/" },
      "text": "Example group post text",
      "permalink": "https://www.facebook.com/groups/{groupId}/posts/{postId}/",
      "time": "4小时",
      "media": []
    }
  ],
  "partial": false
}
```

- `members`: member count normalized to a number (e.g. `34.5 万位成员` -> `345000`).
- `privacy`: `"public"` or `"private"` (from the group header label).
- `about`: best-effort sidebar description; may be truncated with `展开`.
- `posts[].text`: may be `null` for posts where no reliable text anchor is found (cascade uses `data-ad-preview`, `dir=auto`, then a leaf-div fallback).
- `posts[].media`: real CDN photos/videos only; emoji images are filtered out.
- `partial`: `true` when fewer posts than `limit` were available (stream exhausted) or collection was stopped early.

## Usage

```
websculpt facebook get-group --group travelingtheworlds
websculpt facebook get-group --group 846609942711192 --limit 100
websculpt facebook get-group --group my-group --limit 1
```

## Common Error Codes

- `MISSING_PARAM` — `group` was empty/missing.
- `INVALID_PARAM` — `limit` is not an integer in 1-100.
- `NOT_FOUND` — group does not exist or is not accessible.
- `DRIFT_DETECTED` — the page loaded but the expected group-header anchors were not found (site structure changed).
- `NAVIGATION_FAILED` — the group page could not be loaded.
- `AUTH_REQUIRED` / `BROWSER_ATTACH_REQUIRED` — login missing or Chrome remote debugging not connected (runner-level).
