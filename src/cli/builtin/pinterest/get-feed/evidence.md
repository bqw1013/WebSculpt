# Evidence: pinterest/get-feed

This document records the research and validation evidence for the `pinterest/get-feed` command.

## Exploration Path

- Explore verified on 2026-08-19 (assessed, status: passed).
- Command library check: only `pinterest/search` exists in the pinterest domain (user source, browser runtime, login required). `pinterest/get-feed` is a new command.
- Browser automation guide read before explore. Explore used `@playwright/cli` attaching to the user's Chrome via CDP.

## Verified URLs

- `https://www.pinterest.com/` — logged-in home feed: masonry of pin cards; scroll loads more via `UserHomefeedResource` (bookmark cursor pagination). Anonymous visit (curl, no cookies): HTTP 200 but renders the marketing landing page (`landingPage.viewType=202`), no masonry, no pins.
- `https://www.pinterest.com/resource/UserHomefeedResource/get/` — the homefeed pagination API. GET request with `data.options.field_set_key="hf_grid"` and a base64 `bookmarks` cursor array; each response carries 16-18 pin records plus the next bookmark. Success shape: `resource_response.status="success"`, `code=0`.
- `https://www.pinterest.com/search/pins/?q=diy%20tutorial%20video` — used only to validate the video-pin `videos.video_list` HLS structure (feed items and search items share the same pin schema).
- Image original URL pattern: `https://i.pinimg.com/originals/<sig-prefix>/<sig-hash>.<ext>`.
- Video HLS URL pattern: `https://v1.pinimg.com/videos/mc/hls/<...>/<hash>.m3u8`.

## Structural Evidence

### Home feed DOM (logged in)

- Masonry container: `[data-test-id=masonry-container]`
- Grid item: `div[role=listitem][data-grid-item=true]`
- Pin card root: `[data-test-id=pin][data-test-pin-id="<pinId>"][data-test-pin-slot-index=N]`
- Inside card: `div[aria-label="Pin 图卡片"][role=group]` → `div[data-test-id=pinWrapper]`
- Pin link: `a[href="/pin/<id>/"]` (aria-label like "<title> Pin 图页面")
- Image: `img` with `alt` like "其中包括图片：<title>" (Chinese prefix); `srcset` contains 236x/474x/736x/originals tiers; the original is the `https://i.pinimg.com/originals/...` variant (4x tier).
- First screen: ~21 cards in DOM; SSR state holds ~17 pin records.
- Important: the feed card DOM is a *reduced* render — it does NOT contain creator, source link, description, or video HLS URL. Full fields must come from embedded JSON or the API response.

### Embedded SSR state

- `<script id="__PWS_INITIAL_PROPS__" type="application/json">` exists in the initial HTML.
- Path: `JSON.parse(text).initialReduxState.pins` → `{ "<pinId>": <full pin record> }`.
- Auth flag: `initialReduxState.session.isAuthenticated` (`true` logged in, `false` anonymous).
- Pin record keys (50 observed): `id, grid_title, title, description, link, domain, pinner{username,full_name,id}, board{name,url}, images{170x,236x,474x,564x,736x,orig}, videos{node_id,id,video_list}, is_video, is_promoted, story_pin_data, rich_summary, reaction_counts, created_at, link_domain, image_signature, ...`
- Limitation: this script is SSR-only and is NOT updated after scrolling. Scroll-loaded pins appear only in `UserHomefeedResource` API responses.

### UserHomefeedResource API

- Endpoint: `GET https://www.pinterest.com/resource/UserHomefeedResource/get/?source_url=%2F&data={"options":{"field_set_key":"hf_grid","in_nux":false,"in_news_hub":false,"static_feed":false,"bookmarks":["<base64 cursor>"]},"context":{}}&_=<ts>`
- Success response: `resource_response.status === "success"`, `code === 0`.
- `resource_response.data` is an object keyed `"0".."N"` (each value is a full pin record).
- `resource_response.bookmark` is the base64 cursor for the next request; empty/absent = feed exhausted.
- Each batch: 16-18 pins. Scrolling ~1 viewport (1000-1200px) triggers a new request. Continuous batches show distinct bookmark cursors (chained pagination).
- Across 3 saved batches (50 pins) there were 0 duplicate ids; SSR state and the first API batch may overlap, so the command dedupes by pin id.

### Pin field mapping (contract output)

- `id` ← `pin.id`
- `title` ← `pin.grid_title || pin.title`
- `description` ← `pin.description`
- `imageUrl` ← `pin.images.orig.url` (poster for video pins too)
- `videoHlsUrl` (video pins only) ← highest-tier entry in `pin.videos.video_list` (keys e.g. `V_HLSV4`, `V_HLSV3_MOBILE`); its `url` is the HLS m3u8
- `sourceLink` ← `pin.link` (may be null when no outbound link)
- `creator` ← `{ username: pin.pinner.username, displayName: pin.pinner.full_name }`
- `pinUrl` ← `https://www.pinterest.com/pin/<id>/`

### Verified samples

Image pin:
```json
{
  "id": "1083045410420876896",
  "title": "Smoothie Recipes Packed with Superfoods",
  "description": "These superfood smoothie recipes make healthy eating easy...",
  "imageUrl": "https://i.pinimg.com/originals/f4/91/53/f491534f4b70040d3cc591d2e2a67e11.png",
  "videoHlsUrl": null,
  "sourceLink": "https://healthyhabit-bfmcs3pa.manus.space/",
  "creator": { "username": "adilhsham123", "displayName": "healthyhabits" },
  "pinUrl": "https://www.pinterest.com/pin/1083045410420876896/"
}
```
Video pin:
```json
{
  "id": "317503842485656922",
  "title": "5 Minutes Craft Tips",
  "description": "Subscribe me we provided some tips in life that you will love them, DIY craft.",
  "imageUrl": "https://i.pinimg.com/originals/68/91/f3/6891f3a7740a2e7809ebbc79b60caf8b.jpg",
  "videoHlsUrl": "https://v1.pinimg.com/videos/mc/hls/a2/57/44/a2574465b2d1b208b14baed136acf050.m3u8",
  "sourceLink": null,
  "creator": { "username": "06guptapooja", "displayName": "gupta pooja" },
  "pinUrl": "https://www.pinterest.com/pin/317503842485656922/"
}
```

## Failure Signals

- Not logged in / auth required: anonymous `https://www.pinterest.com/` returns HTTP 200 but renders the landing page (`landingPage.viewType=202`, signup CTAs), no `masonry-container`, no pins, and `initialReduxState.session.isAuthenticated === false`. The command must throw `AUTH_REQUIRED`.
- Feed data absent: if `#__PWS_INITIAL_PROPS__` and `[data-test-id=masonry-container]` are both missing after load, the page structure drifted or is an unknown state → `DRIFT_DETECTED`.
- Feed exhaustion: `resource_response.bookmark` empty/absent on the last batch, or several consecutive scroll rounds with no new unique pin ids → return fewer results with `partial: true`.
- Throttle / rate limiting: an API response with `status !== "success"` or `code !== 0`, repeated empty batches, or no response arriving after a scroll are signs of rate limiting → back off (longer randomized waits) before retrying; the command keeps randomized short scroll intervals (200-500ms) plus random scroll amounts to stay low-frequency.
- DOM virtualizes: the pin-card element count fluctuates while scrolling (masonry recycles off-screen nodes), so the command must count unique pin ids, not DOM card count.

## Capture Assessment

This path is a verified, repeatable, parameterizable route: the logged-in personalized home feed is a core Pinterest surface, it can be fetched by reading the SSR state plus intercepted `UserHomefeedResource` responses, and the full output contract (id/title/description/imageUrl|videoHlsUrl/sourceLink/creator/pinUrl) is fully covered by the API data with no per-pin detail-page visits. It is worth capturing as `pinterest/get-feed`, complementing the existing `pinterest/search` (which requires keyword input and visits each detail page). A `--limit` parameter (1-100) generalizes the fetch depth; runtime is `browser` because the feed is login-gated and served by session-bound resource APIs.
