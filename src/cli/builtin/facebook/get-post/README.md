# facebook/get-post

Fetch a single Facebook post with its full text, author, time, media, and engagement stats, optionally including comments with nested replies.

## Description

Given any Facebook post URL, this command opens the post in the logged-in browser and returns the post body (author, full text, publish time, media, like/comment/share counts) and, by default, its comments. Comments are loaded incrementally through the page's "view more comments" control and nested replies are expanded via the "view N replies" control, up to a configurable limit.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `url` | yes | - | Full URL of the Facebook post. Supported forms: `/permalink.php?story_fbid={pfbid}&id={authorId}`; `/{user-or-page}/posts/{pfbid}`; `/groups/{groupId}/permalink/{postId}/`; `/groups/{groupId}/posts/{postId}/` (the raw form emitted by `facebook/get-group`); `/videos/{id}`; `/reel/{id}`; `/watch/?v={id}` (the video permalink form emitted by `facebook/get-feed`). Tracking params (`__cft__` etc.) may be included or stripped. |
| `include_comments` | no | `true` | Whether to also extract comments. Set `false` to fetch only the post itself (much faster). |
| `comment_limit` | no | `20` | Maximum comments to return (1-100), nested replies included. Only effective when `include_comments` is `true`. |

## Return Value

```json
{
  "author": { "name": "Gan Kim Yong", "url": "https://www.facebook.com/GANKIMYONGPAGE" },
  "text": "Explored the COMO Adventure Grove playground at Singapore Botanic Gardens...",
  "permalink": "https://www.facebook.com/GANKIMYONGPAGE/posts/pfbid02eCph...",
  "time": "2026年8月3日周一14:58",
  "media": [ { "type": "photo" | "video", "url": "..." } ],
  "stats": { "likes": 2216, "comments": 54, "shares": 34 },
  "comments": [
    {
      "author": { "name": "...", "url": "..." },
      "text": "...",
      "time": "2026年8月4日周二06:21",
      "likes": 3,
      "replies": [ { "author": {...}, "text": "...", "time": "...", "likes": null } ]
    }
  ],
  "partial": true
}
```

- `media` may be empty when the post has no photos/videos.
- `stats.comments` / `stats.shares` are best-effort (extracted from the action-bar number sequence; may be null when unavailable).
- `comments` is present only when `include_comments` is `true`.
- `partial` is `true` when the comment stream reached `comment_limit` before exhausting all comments.
- Video/reel/watch posts render inside the player UI. `/reel/` posts expose the author (from the "· 关注" header) and caption (hashtags/description) reliably, with badges (`已认证账户`) and live stat suffixes stripped. `/videos/` and `/watch/` posts expose the author via the post header (author heading with badge, or the heading next to the follow button).
- Known limitations for video forms: `media` is best-effort — Facebook does not put the video poster into the DOM until the video is playing, so `/videos/` and `/watch/` pages often report an empty `media` list while `/reel/` pages expose a poster. Reel stats are rendered as animated/split counters and are not reliably parseable from the DOM, so `stats` is empty for reels. Like counts are extracted where an aria-label like `赞：N位用户` / `赞：N 万位用户` is present (the `万` unit is expanded).
- A dead/broken video URL (Facebook renders "页面无法显示") returns `NOT_FOUND` instead of an empty success.
- `/permalink.php?story_fbid=<pfbid>...` does not resolve in the current Facebook app (the page shows "内容暂时无法显示"); the command returns `NOT_FOUND` for it. Legacy numeric `story_fbid` permalink.php URLs may still work.

## Usage

```
websculpt facebook get-post --url "https://www.facebook.com/Meta/posts/pfbid024vkXSP2PWvwcxNdRS5fsdjg3AQrCXtHF2R3viVTR1tLga65exsVKGi86VhcLEEPSl"
websculpt facebook get-post --url "https://www.facebook.com/groups/travelingtheworlds/posts/1999547694084072/" --comment_limit 5
websculpt facebook get-post --url "https://www.facebook.com/{userId}/videos/{videoId}" --include_comments false
websculpt facebook get-post --url "https://www.facebook.com/watch/?v={videoId}" --include_comments false
websculpt facebook get-post --url "https://www.facebook.com/reel/{reelId}" --include_comments false
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | `url` is empty/missing. |
| `INVALID_PARAM` | `url` is not a facebook.com URL, or `comment_limit` is not an integer in 1-100. |
| `NOT_FOUND` | Post content is unavailable (deleted, private, or the sharing audience changed; page shows "内容暂时无法显示"). |
| `AUTH_REQUIRED` | Facebook login is required (login form / checkpoint detected). |
| `DRIFT_DETECTED` | No post article found on the page — the page structure may have changed. |
