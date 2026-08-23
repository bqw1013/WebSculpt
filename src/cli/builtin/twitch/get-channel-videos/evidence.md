# Evidence: twitch/get-channel-videos

This document records the research and validation evidence for the `twitch/get-channel-videos` command.

## Exploration Path

Command library overlap check (`websculpt command list twitch`): only `twitch/search` (browser runtime) exists; `twitch/get-channel-videos` is a new command, no conflict. Other commands in the same planning batch (get-feed, list-categories, get-channel, get-channel-clips, get-video, get-clip) are separate candidates.

Exploration workspace audited with `websculpt explore assess` (status: passed, candidate `twitch/get-channel-videos`, Confirmation recorded 2026-08-17).

The site's public data path was verified two ways during exploration:
1. Browser (Playwright CLI, session <session>): visited `https://www.twitch.tv/lck/videos` and `https://www.twitch.tv/shroud/videos`, clicked through the filter dropdown (all / past broadcasts / highlights / uploads / collections), mapped the DOM card structure and stable data-a-target hooks.
2. Node direct: `node fetch` against `https://gql.twitch.tv/gql` with the public Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko` returned full structured data with no auth token, no integrity check, and no 429 rate limiting across 10 concurrent + 20 paced calls.

Runtime reclassified from `browser` (plan assumption) to `node` because direct GraphQL is unthrottled and information volume (absolute publishedAt, lengthSeconds, game.slug) exceeds the browser DOM (relative dates only).

## Verified URLs

- https://www.twitch.tv/lck/videos
- https://www.twitch.tv/shroud/videos?filter=all
- https://www.twitch.tv/shroud/videos?filter=collections
- https://gql.twitch.tv/gql

## Structural Evidence

### GraphQL operation (primary path, reused by command.js)

Endpoint: `https://gql.twitch.tv/gql`
Headers: `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko`, `Content-Type: application/json`
Method: POST, body is a JSON array (batch) containing one persisted query:

```json
[{
  "operationName": "FilterableVideoTower_Videos",
  "variables": {
    "includePreviewBlur": false,
    "limit": 30,
    "channelOwnerLogin": "shroud",
    "broadcastType": null,
    "videoSort": "TIME"
  },
  "extensions": {
    "persistedQuery": { "version": 1, "sha256Hash": "67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f" }
  }
}]
```

Response shape (verified): the response is an array; element `[0].data.user` is the channel.

```json
{
  "data": {
    "user": {
      "id": "37402112",
      "videos": {
        "edges": [
          {
            "cursor": "...",
            "node": {
              "id": "2827992810",
              "title": "ME N THE GIRLS R GONNA POP OFF IN THIS 100K TWITCH RIVALS",
              "lengthSeconds": 20988,
              "viewCount": 249678,
              "publishedAt": "2026-07-24T17:56:52Z",
              "previewThumbnailURL": "https://static-cdn.jtvnw.net/cf_vods/.../thumb0-320x180.jpg",
              "game": { "displayName": "VALORANT", "slug": "valorant", "id": "516575" },
              "owner": { "login": "shroud", "displayName": "shroud", "id": "37402112" },
              "broadcastIdentifier": { "id": "317074350583" }
            }
          }
        ],
        "pageInfo": { "hasNextPage": true }
      }
    }
  }
}
```

### Variable mapping (verified by live probes)

- `channelOwnerLogin` = channel login (e.g. "lck", "shroud").
- `limit` = number of results; `limit=100` returned 100 edges (no API cap at 30; the page's 30-card cap is a UI rendering limit only).
- `broadcastType` (type filter):
  - `null` → "all" / 所有视频
  - `"ARCHIVE"` → "past-broadcasts" / 过往直播
  - `"HIGHLIGHT"` → "highlights" / 精选内容
  - `"UPLOAD"` → "uploads" / 上传
  - `"COLLECTION"` is rejected by the API (invalid enum value); the page's 播放列表 (collections) filter uses a different operation `ChannelCollectionsContent` and returns collections (playlists), not videos — intentionally out of scope for this command (v1).
- `videoSort` = `"TIME"` (date, default) or `"VIEWS"` (popularity). Command sorts by TIME (matches page default).

### Output field derivation

- `url` = `https://www.twitch.tv/videos/{node.id}`
- `duration` = formatted from `lengthSeconds` (H:MM:SS when >= 1h, else M:SS); `durationSeconds` = raw `lengthSeconds`
- `views` = `viewCount`
- `publishedAt` = absolute ISO string from API (better than page relative text such as "去年")
- `category` = `{ name: game.displayName, slug: game.slug }`
- `thumbnailUrl` = `previewThumbnailURL`
- `partial` = `pageInfo.hasNextPage` (true means the channel has more videos than returned)
- `channelFound` = `false` when `data.user` is `null` (nonexistent channel)

### Browser DOM structure (fallback reference, in case a future browser runtime is needed)

Card container: `article`; stable hooks `a[data-a-target="preview-card-image-link"]` (href=/videos/{id}; innerText lines = duration / views / date), `preview-card-channel-link` (channel), `preview-card-game-link` (category), `article h4` (title), `img[data-test-selector="preview-card-thumbnail__image-selector"]` (thumbnail). Scroll container `div.scrollable-area.root-scrollable`; anonymous page grid renders 30 cards with no "Show more" button.

## Failure Signals

- HTTP status != 200 from gql.twitch.tv → network failure or server-side throttling; command should surface the status.
- `data.user === null` → channel does not exist → `CHANNEL_NOT_FOUND`.
- `data.user.videos` missing/undefined → GraphQL response structure changed → `DRIFT_DETECTED`.
- `edges` empty + `hasNextPage:false` → channel has no videos of that type → return empty `results` with `count:0` (not an error).
- No auth token / integrity required for this operation; if Twitch later starts returning 403/429 requiring an integrity token, the node path degrades — fallback is the same operation executed through the browser runtime.
- Rate limiting: not observed across 10 concurrent + 20 paced probes (6 channels, all broadcastType values, ~15s). Command still adds random sleep 200-700ms between requests per polite-pacing policy.

## Capture Assessment

The path is verified, reproducible, and parameterizable: a single persisted GraphQL query returns channel videos with richer data than the page DOM, no login, no rate limit observed, and works over plain `node fetch`. It fills a recurring need (enumerate a channel's VOD archive). Recommend capturing as `twitch/get-channel-videos` with `runtime: node`, parameters `channel` (required), `type` (enum, default all), `limit` (1-100, default 20).
