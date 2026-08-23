# facebook/get-page

Fetch a Facebook Page (公共主页) and its sub-pages: posts timeline, about, photos, reels, followers. Page sub-pages use path-based URLs (`/{page}/about`, `/{page}/photos`, …), unlike personal profiles which use `sk=` parameters.

## Description

Navigates to `https://www.facebook.com/{page}` (or the sub-URL for the selected tab) and extracts structured data. For the `posts` tab it reads the Page's post timeline (top-level `div[role="article"]` elements that carry a post permalink; comments nested inside a post are ignored). For `about` it reads the Page header card (name, follower count, category, description, verified badge). `photos`, `reels`, and `followers` read their respective grids/lists. List tabs scroll internally with natural, randomized pacing until the requested `limit` is reached or the list is exhausted (`partial=true`).

Stable anchors only: ARIA roles (`role="article"`, `role="img"`), `data-ad-preview="message"`, `a[href*="/followers"]`, and URL path structure (`/posts/{pfbid}`, `/reel/{id}`, `photo.php?fbid=`, `/photo/?fbid=`). No class names are used.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | string | yes | — | Vanity name of the Page, i.e. the segment in `facebook.com/{page}`. Find it from the address bar or via `facebook/search --type pages`. |
| `tab` | enum | no | `posts` | `posts` (帖子, `/{page}/`) \| `about` (简介, `/{page}/about`) \| `photos` (照片, `/{page}/photos`) \| `reels` (Reels, `/{page}/reels_tab`, redirects to `/reels/`) \| `followers` (粉丝, `/{page}/followers`). |
| `limit` | number | no | 20 | Maximum items to return (1-100). Applies to posts/photos/reels/followers; ignored for `about`. |

## Return Value

Common envelope: `{ page, tab, count, limit, partial }` plus a tab-specific key.

**posts** → `posts`:
```json
{
  "page": "Meta", "tab": "posts", "count": 3, "limit": 3, "partial": true,
  "posts": [
    {
      "author": { "name": "Meta", "url": "https://www.facebook.com/Meta" },
      "text": "secret synth pop-up with artist-composer Geller, anyone? …",
      "permalink": "https://www.facebook.com/Meta/posts/pfbid02HvdY7aA9FR3npWLcBMtrnGEFW1exw4rNG1w6jA6bLuAqz3v45xeTgYxJQXT3bSa7l",
      "time": "3天",
      "media": [ { "type": "photo", "url": "https://scontent-cgk2-2.xx.fbcdn.net/..." } ],
      "stats": { "likes": null, "comments": null, "shares": null }
    }
  ]
}
```

**about** → `about`:
```json
{
  "page": "Meta", "tab": "about", "count": 1, "limit": null, "partial": false,
  "about": {
    "name": "Meta", "url": "https://www.facebook.com/Meta",
    "category": "公司",
    "description": "Connect with what you love to make things happen.",
    "followers": "1亿", "followersUrl": "https://www.facebook.com/Meta/followers",
    "verified": true
  }
}
```

**photos** → `photos` (each `{url, imageUrl}`), **reels** → `reels` (each `{url, imageUrl, views}`), **followers** → `followers` (each `{name, url, descriptor?}`).

- `permalink` (posts) is a clean post URL that can be fed to `facebook/get-post`.
- `followers` may show only a subset of a large Page's followers — `partial=true` is normal there.
- `followers` count / reels `views` keep the localized notation ("1亿", "543万", "3.4万", "2,900").

## Usage

```
websculpt facebook get-page --page Meta
websculpt facebook get-page --page Meta --tab about
websculpt facebook get-page --page Wikipedia --tab photos --limit 5
websculpt facebook get-page --page Meta --tab followers --limit 3
websculpt facebook get-page --page Meta --tab reels
```

## Common Error Codes

- `MISSING_PARAM`: `page` is not provided.
- `INVALID_PARAM`: `page` is not a single URL segment, `tab` is not one of the 5 values, or `limit` is not a positive integer.
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `PAGE_NOT_FOUND`: the given Page does not exist or its content is unavailable ("内容暂时无法显示").
- `AUTH_REQUIRED`: no Facebook login session in the attached browser.
- `ACCESS_BLOCKED`: Facebook served an account check / temporary block page.
- `DRIFT_DETECTED`: the Page header (`a[href*="/followers"]`) was not found (structure changed).

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled, and an active Facebook login session in that browser.
