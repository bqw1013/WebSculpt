# pinterest/get-user

## Description

Fetch a Pinterest user's public profile and one content tab. The command always returns profile metadata (display name, bio, avatar, follower/following counts, monthly views, external links). The `--tab` parameter selects which content tab to additionally load:

- `saved` (default): the user's Boards — their curated Pin collections shown on the profile's default view.
- `created`: Pins the user originally published, served at `/<username>/_created/`.

Requires a logged-in browser session (all Pinterest data endpoints require login).

## Parameters

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `username` | string | yes | - | Pinterest username, the segment in the profile URL `https://www.pinterest.com/<username>/`. |
| `tab` | enum | no | `saved` | `saved` (boards grid) or `created` (original pins stream). |
| `limit` | number | no | `20` | Maximum boards (saved) or Pins (created) to return, 1-100. Lazy-loads on scroll; returns fewer with `partial: true` when the feed is exhausted. |

## Return Value

```jsonc
{
  "username": "joyfilledeats",
  "displayName": "Joy Filled Eats - Keto, Low Carb, Gluten & Sugar Free Recipes",
  "bio": "Welcome! I’m Taryn. ...",
  "avatarUrl": "https://i.pinimg.com/280x280_RS/6c/d4/29/6cd429039b5deef0fe2744959fe7e3a9.jpg",
  "followersCount": 315544,
  "followingCount": 180,
  "monthlyViews": 1432940,
  "externalLinks": ["http://www.joyfilledeats.com/", "https://www.instagram.com/joyfilledeats"],
  "profileUrl": "https://www.pinterest.com/joyfilledeats/",
  "tab": "saved",
  "count": 20,
  "partial": false,
  // tab=saved:
  "boards": [
    {
      "name": "Coffee Drinks, Desserts, & More!",
      "url": "https://www.pinterest.com/joyfilledeats/coffee-drinks-desserts-more/",
      "pinCount": 16,
      "lastUpdated": "Sun, 09 Aug 2026 01:31:56 +0000",
      "owner": { "username": "joyfilledeats", "displayName": "Joy Filled Eats - Keto, Low Carb, Gluten & Sugar Free Recipes" },
      "isCollaborative": false
    }
  ]
  // tab=created:
  "pins": [
    {
      "id": "109282728455182545",
      "title": "Pickle Roll Ups (Easy 3-Ingredient Appetizer)",
      "imageUrl": "https://i.pinimg.com/originals/cf/d0/cc/cfd0cc71379d61035214a51af2acac16.png",
      "pinUrl": "https://www.pinterest.com/pin/109282728455182545/"
    }
  ]
}
```

Notes:
- Boards may include collaborative group boards (`isCollaborative: true`) owned by other users; `owner` reflects the true owner.
- `monthlyViews` maps to the API's `profile_views` field (the "月浏览量" shown on the page).
- For video Pins, `imageUrl` is the cover image; fetching the actual video requires `pinterest/get-pin` or `pinterest/download`.

## Usage

```
websculpt pinterest get-user --username joyfilledeats
websculpt pinterest get-user --username joyfilledeats --tab created --limit 30
websculpt pinterest get-user --username joyfilledeats --tab saved --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — required `username` was not provided.
- `INVALID_PARAM` — `limit` is not a positive integer.
- `LIMIT_EXCEEDED` — `limit` exceeds 100.
- `NOT_FOUND` — the username does not exist (page redirects to `/?show_error=true`) or the profile did not render.
