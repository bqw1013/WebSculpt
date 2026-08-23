# Evidence: twitch/get-video

This document records the research and validation evidence for the `twitch/get-video` command.

## Exploration Path

Command library check: `websculpt command list twitch` shows only `twitch/search` (keyword search for channels/categories/videos via browser GraphQL). `twitch/get-video` (single VOD detail) is a distinct need, not covered.

Explore was conducted via `@playwright/cli` attach to the user's Chrome, verified in a prior explore workspace (assess passed).

The `/videos/{id}` page has no useful og meta (site-wide generic values: og:title "Twitch", og:description "Twitch is the world's leading video platform...", og:image twitch_logo3.jpg) and no embedded SSR state. All video data comes from Twitch's internal GraphQL endpoint `https://gql.twitch.tv/gql` (POST with public web Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko`).

## Verified URLs

- https://www.twitch.tv/videos/2577728783 (LCK 2025 Grand Finals VOD; VideoMetadata detail + empty chapters)
- https://www.twitch.tv/videos/2576832385 (LCK 2025 Lower Finals VOD; generalization)
- https://www.twitch.tv/videos/2827192082 (shroud VOD; different channel)
- https://www.twitch.tv/videos/2846431544 (xQc VOD; `moments.edges` = 6 chapter structure confirmed)
- https://www.twitch.tv/videos/2848313191 / 2845537985 / 2842747774 / 2841886176 (xQc VODs; chapters 4-7, generalization)
- https://www.twitch.tv/videos/999999999999 (nonexistent id; `core-error` page + gql `video:null`)
- https://gql.twitch.tv/gql (node direct probe: anonymous 200, no 429 on rapid+spaced requests, `video(id:)` works anonymously, but `video.moments` returns `server error` anonymously)
- https://www.twitch.tv/lck/videos , https://www.twitch.tv/shroud/videos , https://www.twitch.tv/xqc/videos (list pages used to source real VOD ids)

## Structural Evidence

Primary operation `VideoMetadata` — request variables `{channelLogin: String!, videoID: ID!}`. The page resolves the channel login internally on a fresh navigation to `/videos/{id}` and fires this operation. A same-page `page.reload()` may NOT re-fire it (HTTP caching), so the command MUST use a fresh `page.goto`. Response shape (verified on 2577728783):

```json
{
  "data": {
    "user": { "id": "124425501", "displayName": "LCK", "login": "lck", "profileImageURL": "...", "followers": { "totalCount": 2064890 } },
    "video": {
      "id": "2577728783",
      "title": "HLE vs GEN | Grand Finals | Woori Bank 2025 LCK Playoffs",
      "description": null,
      "previewThumbnailURL": "https://static-cdn.jtvnw.net/cf_vods/.../thumb/thumb0-90x60.jpg",
      "createdAt": "2025-09-28T04:00:33Z",
      "viewCount": 756743,
      "publishedAt": "2025-09-28T04:00:33Z",
      "lengthSeconds": 21816,
      "broadcastType": "ARCHIVE",
      "owner": { "id": "124425501", "login": "lck", "displayName": "LCK" },
      "game": { "id": "21779", "slug": "league-of-legends", "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/21779-{width}x{height}.jpg", "name": "League of Legends", "displayName": "League of Legends" }
    }
  },
  "extensions": { "operationName": "VideoMetadata" }
}
```

Chapters operation `VideoPlayer_ChapterSelectButtonVideo` — request variables `{includePrivate: false, videoID: ID!}`. Response `video.moments.edges[].node`:

```json
{
  "data": { "video": { "id": "2846431544",
    "moments": { "edges": [ { "node": {
      "id": "04aa1fca45c54b0ae9232339ce06acb7",
      "positionMilliseconds": 0,
      "durationMilliseconds": 8539000,
      "type": "GAME_CHANGE",
      "description": "Just Chatting",
      "subDescription": ""
    } } ] } } },
  "extensions": { "operationName": "VideoPlayer_ChapterSelectButtonVideo" }
}
```

Chapter title <- `node.description`; startAt <- `node.positionMilliseconds / 1000` (seconds). Empty `edges` for VODs without chapters. Only `type: GAME_CHANGE` observed.

Rendered DOM: video info lives in `.channel-info-content` (inner `SECTION.skip-to-target` > `metadata-layout__split-top`); canonical URLs: video `https://www.twitch.tv/videos/{id}`, channel `https://www.twitch.tv/{owner.login}`, category `https://www.twitch.tv/directory/category/{game.slug}`. Thumbnail `previewThumbnailURL` may carry a `{width}x{height}` placeholder (normalize to 320x180). Nonexistent video renders `.core-error` with localized message "抱歉。您恐怕得搭乘时光机才有办法找回那个内容了。"

No traditional comments: `VideoComments` / `VideoCommentsByOffsetOrCursor` return chat-replay real-time message streams (badges/cheerConfig/offsetSeconds), not enumerable comment lists — intentionally not extracted.

## Failure Signals

- Nonexistent/invalid video id: page renders `.core-error`; gql returns `{"data":{"video":null}}`. Command throws `NOT_FOUND`.
- Missing or malformed `--url`: empty -> `MISSING_PARAM`; no `/videos/{digits}` match -> `INVALID_PARAM`.
- VideoMetadata not captured and no `.core-error` within timeout: throws `TIMEOUT` (page structure or network drift).
- Page structure change (`.core-error` selector gone, operation renamed): `DRIFT_DETECTED`.
- Subscriber-only VODs may be inaccessible (not verified with a live sample; documented as a dependency).
- Polite pacing: Twitch may throttle after high-frequency navigation; command keeps a random 200-800ms pacing before navigation. Node direct probe showed no 429 on a small burst, but browser path is retained because anonymous `video.moments` (chapters) returns `server error` from node.

## Capture Assessment

This command should be captured. Video lists (`twitch/get-channel-videos`, `twitch/search --type video`) only expose cards; a single VOD's full detail (title, channel, category, duration, views, publish date, description, chapters, thumbnail) is a distinct, reusable need. The path is fully verified: `VideoMetadata` + `VideoPlayer_ChapterSelectButtonVideo` on `https://gql.twitch.tv/gql`, reachable anonymously via the user's browser session, with clear failure signals for invalid ids. Matches the confirmed contract (browser runtime, fresh goto, chapters as `{title, startAt}`).
