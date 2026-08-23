# facebook/get-feed

Fetch the Facebook home feed (首页信息流): the algorithmic timeline shown at facebook.com, returned as structured posts.

## Description

Navigates to `https://www.facebook.com/`, reads the feed container `div[role="feed"]`, and extracts each post (`div[role="article"]`) with its author, text, permalink, time, media (photos/videos), and like/comment/share counts. Scrolls internally (natural, randomized scrolling) to load more posts until the requested limit is reached or the stream is exhausted. The feed is algorithmically ordered; there is no sort or time filter.

Stable anchors only: ARIA roles (`role="feed"`, `role="article"`, `role="button"`), the `data-ad-preview="message"` attribute, and URL path structure. Non-post articles (loading placeholders, Reels recommendation rails) are filtered out.

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | number | no | 20 | Maximum posts to return (1-100). The command scrolls internally until the limit is reached or the stream is exhausted (`partial=true`). |

## Return Value

```json
{
  "posts": [
    {
      "author": { "name": "BBC Bristol", "url": "https://www.facebook.com/BristolBBC" },
      "text": "Look at them go",
      "permalink": "https://www.facebook.com/BristolBBC/posts/pfbid038H9R6r7TwXMtf9UjcNiFUJ5wWAjPsH1VXnHqmNeX1VSBBLMg3Sg6NdVwnDgiAaS1l",
      "time": "20小时",
      "media": [ { "type": "photo", "url": "https://scontent-cgk1-1.xx.fbcdn.net/..." } ],
      "stats": { "likes": "7,242", "comments": "418", "shares": "501" }
    }
  ],
  "count": 1,
  "limit": 20,
  "partial": false
}
```

- `posts`: array of posts. `author.url` is the profile/page URL. `permalink` is a clean post URL (tracking params `__cft__`/`__tn__` stripped); it can be fed directly to `facebook/get-post`. `text` is null for posts without a message; a trailing "… 展开" truncation marker is stripped. `time` is the localized relative time shown in the feed (e.g. "20小时", "4天", "6月12日"). `media[].url` is a CDN image URL (photo) or the video poster thumbnail (video). `stats` values keep the localized notation (e.g. "4.5万"); a count that is absent is `null`.
- `count`: number of returned posts.
- `limit`: the requested limit.
- `partial`: true when the feed was exhausted (or stopped yielding new posts) before reaching `limit`.

## Usage

```
websculpt facebook get-feed
websculpt facebook get-feed --limit 5
websculpt facebook get-feed --limit 100
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not a positive integer (e.g. `--limit 0`, `--limit abc`).
- `LIMIT_EXCEEDED`: `limit` is greater than 100.
- `AUTH_REQUIRED`: no Facebook login session in the attached browser.
- `ACCESS_BLOCKED`: Facebook served an account check / temporary block page.
- `DRIFT_DETECTED`: the feed container `div[role="feed"]` was not found (page structure changed).

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled, and an active Facebook login session in that browser.
