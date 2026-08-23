# dailymotion/get-feed

Fetch the logged-in Dailymotion homepage **Discover (发现)** feed — the personalized, region-localized video stream a logged-in user sees at dailymotion.com. There is no public API for this surface (anonymous access returns HTTP 401); the feed reflects the browser session's locale and personalization.

## Description

The command loads `https://www.dailymotion.com/` (which redirects to the session's region locale, e.g. `/ca`) and reads the personalized Discover feed. Primary path is the page's own GraphQL query (`SEARCH_DISCOVERY_QUERY`, `algorithm: PERSONALIZED`, authenticated with the browser's `access_token` cookie) which returns rich fields: duration, ISO publish time, uploader display name + verified badge (`accountType`), aspect ratio. If GraphQL is unavailable, the command falls back to extracting the rendered feed cards from the DOM.

The feed is a **fixed batch of 40 cards** — scrolling does not load more and there is no pagination. `limit` above 40 returns all 40 with `partial: true`.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `limit` | no | `20` | Maximum videos to return (1-100). The feed caps at 40; `limit > 40` returns all 40 with `partial: true`. |

## Return Value

```json
{
  "items": [
    {
      "id": "<video-id>",
      "title": "<video-title>",
      "url": "https://www.dailymotion.com/video/<video-id>",
      "duration": 95,
      "thumbnail": "https://s1.dmcdn.net/v/<thumbnail-id>/x240",
      "owner": "<channel-name>",
      "ownerVerified": "verified-partner",
      "createdAt": "2026-08-18T01:54:38+00:00",
      "publishedAgo": "3h ago",
      "aspectRatio": 1.77778
    }
  ],
  "count": 1,
  "partial": false,
  "source": "graphql"
}
```

- `items`: video cards. `duration` (seconds) and `createdAt`/`publishedAgo` come from GraphQL; the DOM fallback sets them to `null` because cards do not render them.
- `count`: number of items returned.
- `partial`: `true` when fewer items were returned than requested (i.e. `limit > 40`, or the feed was empty).
- `source`: `"graphql"` (primary) or `"dom"` (fallback) — which extraction path produced the result.

## Usage

```
websculpt dailymotion get-feed
websculpt dailymotion get-feed --limit 40
websculpt dailymotion get-feed --limit 5
```

## Common Error Codes

| code | meaning |
|------|---------|
| `AUTH_REQUIRED` | No Dailymotion login session in the browser. The Discover feed is personalized and returns 401 without `access_token`. Open dailymotion.com while logged in, then retry. |
| `INVALID_PARAM` | `limit` is not a positive integer (1-100). |
| `LIMIT_EXCEEDED` | `limit` is greater than 100. |
| `DRIFT_DETECTED` | The feed container and the GraphQL query both failed — the homepage structure likely changed. |
