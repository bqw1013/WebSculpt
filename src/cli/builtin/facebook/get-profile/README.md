# facebook/get-profile

Fetch a Facebook personal profile (个人主页) and its sub-pages. Given a user's numeric ID or username, returns the mixed post timeline (全部), structured bio (简介), photos (照片), reels (Reels), and follower/following/friend lists (粉丝/关注/好友). Implemented via the `?sk=` URL parameter on the profile URL.

## Description

Reads a Facebook personal profile and the selected sub-page. `user` accepts a numeric user ID or a username — both appear in profile URLs (`facebook.com/profile.php?id={userId}` or `facebook.com/{username}`). Visibility of each sub-page depends on the target's privacy settings; `friends` in particular is only visible when the friend list is public or you are friends with the target.

## Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `user` | string | yes | - | Numeric user ID or username of the profile. Both forms appear in Facebook URLs: `facebook.com/profile.php?id={userId}` (数字 ID) or `facebook.com/{username}`. To find a user's ID/username, open their profile and copy it from the address bar, or use `facebook/search --type people`. |
| `tab` | enum | no | `all` | Profile sub-page. All 7 values with Chinese labels and the corresponding sk param: `all`=全部 (no sk, mixed timeline) / `about`=简介 (sk=about, structured bio) / `photos`=照片 (sk=photos) / `reels`=Reels (sk=reels_tab) / `followers`=粉丝 (sk=followers) / `following`=关注 (sk=following) / `friends`=好友 (sk=friends). |
| `limit` | number | no | 20 | Maximum items to return (1-100). Applies to feed/list tabs only (`all`/`photos`/`reels`/`followers`/`following`/`friends`); ignored for `about`. Scrolls internally; `partial=true` when the list ends early. |

## Return Value

Per-tab structured output; list tabs return `partial: true` when exhausted.

- `all` -> `Array<{ author: {name,url}, text, permalink, time, media: [{type:"photo"|"video",url}], stats: {likes?,comments?,shares?} }>` (same post structure as get-feed)
- `about` -> `{ bio, category, location, work: [], education: [], contact: {email?,phone?}|null, links: [] }` (fields absent for a profile type are `null`/empty)
- `photos` -> `Array<{ url: photo viewer (/photo/?fbid=), image: CDN original }>`
- `reels` -> `Array<{ url: /reel/{id}, play_count, thumbnail }>` (no title exposed on the tile grid)
- `followers` / `following` / `friends` -> `Array<{ name, url: profile.php?id= or facebook.com/{vanity} }>`

## Usage

```
websculpt facebook get-profile --user leehsienloong
websculpt facebook get-profile --user leehsienloong --tab about
websculpt facebook get-profile --user 100000000000001 --tab photos --limit 10
websculpt facebook get-profile --user leehsienloong --tab followers --limit 3
```

## Common Error Codes

- `MISSING_PARAM` — `user` is required
- `INVALID_PARAM` — `user` is neither a numeric ID nor a valid username, or `tab` is not one of the 7 enum values, or `limit` is not a positive integer
- `LIMIT_EXCEEDED` — `limit` > 100
- `AUTH_REQUIRED` — no active Facebook login
- `ACCESS_BLOCKED` — Facebook account check / temporary block page
- `NOT_FOUND` — profile deleted, renamed, or inaccessible
- `DRIFT_DETECTED` — page structure changed; expected container missing

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled, and an active Facebook login session in that browser.
