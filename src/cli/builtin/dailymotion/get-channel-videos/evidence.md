# Evidence: dailymotion/get-channel-videos

This document records the research and validation evidence for the `dailymotion/get-channel-videos` command.

## Exploration Path

Explored in a prior explore workspace (explore assess passed, user confirmed on 2026-08-18).

- Command library check: `websculpt command list dailymotion` shows only `dailymotion/search` (browser). No channel/topic-stream command exists. `get-channel-videos` is new.
- Browser exploration (playwright-cli attach, session `<session>`) found that the topic channel pages `/channel/{slug}` are **currently broken**: the client router redirects to `/user/channel/{slug}`, which renders a generic "channel" account (xid `x2pe0lr`, displayName "channel", description "Headline news") with an empty video grid. SSR `<title>` localizes correctly (music=音樂和歌曲視頻) but the content layer does not render. Verified across animals/music/tech/news.
- Therefore the command uses the **public REST API** (`api.dailymotion.com`, no login, no browser) — a deliberate deviation from the plan's browser route, confirmed by the user.
- Page-localized Discover feed (`https://www.dailymotion.com/ca`, Discover tab) is the site's trending representation (~80 video cards); its programmatic equivalent is `GET /videos?sort=trending` (total 462).

## Verified URLs

- https://api.dailymotion.com/channels?fields=id,name&limit=50 (17 topic channels, total=17)
- https://api.dailymotion.com/channel/animals/videos (channel video stream; sort=trending/visited/recent all HTTP 200)
- https://api.dailymotion.com/channel/music/videos?sort=recent (verified with full fields)
- https://api.dailymotion.com/videos?sort=trending (site-wide trending, total 462)
- https://api.dailymotion.com/videos?channel=music&sort=recent (alternative endpoint, identical data)
- https://api.dailymotion.com/channel/animals (single channel metadata)
- https://www.dailymotion.com/ca (homepage Discover feed; browser verification only)

## Structural Evidence

- API base: `https://api.dailymotion.com`.
- 17 topic channel slugs and English display names (verified from `/channels`):
  animals=Animals, auto=Cars, people=Celeb, fun=Comedy & Entertainment, creation=Creative, school=Education, videogames=Gaming, kids=Kids, lifestyle=Lifestyle & How-to, shortfilms=Movies, music=Music, news=News, sport=Sports, tech=Tech, travel=Travel, tv=TV, webcam=Webcam.
- Channel video stream: `GET /channel/{slug}/videos?sort={trending|visited|recent}&fields={...}&limit={n}&page={p}`.
- Site-wide trending: `GET /videos?sort=trending&fields={...}&limit={n}&page={p}`.
- Fields used: `id,title,url,duration,thumbnail_240_url,owner.screenname,created_time,views_total`.
- **Dotted keys are returned as literal single keys**: `owner.screenname` is one JSON key, accessed as `v["owner.screenname"]` — NOT `v.owner.screenname`.
- `views_total` may be `null` for some videos (command outputs `views: null`).
- `total` is capped at 1000; `has_more` boolean drives pagination; `&limit=` up to 100 works.
- Video card mapping: `id` (xid), `url` = `https://www.dailymotion.com/video/{id}`, `duration` seconds, `thumbnail_240_url` cover, `created_time` unix seconds.
- Real sample (channel music, sort=recent): first item `{"id":"<id>","title":"<title>","url":"<video-url>","duration":<duration>,"thumbnail_240_url":"<thumbnail-url>","owner.screenname":"<owner>","created_time":<created-time>,"views_total":<views>}`.
- Real sample (site-wide trending): first items include `<id>` (<owner>), `<id>` (<owner>), `<id>` (<owner>).

## Failure Signals

- API HTTP non-200 or network abort → `REQUEST_FAILED`.
- Invalid `channel` (not one of the 17 slugs) → `INVALID_PARAM`.
- Invalid `sort` (not trending/visited/recent) → `INVALID_PARAM`.
- Invalid `limit` (non-integer, or outside 1-100) → `INVALID_PARAM`. Raw string is regex-validated before parseInt to avoid truncation.
- `data.list` missing or empty while `has_more` stays true → loop guard stops pagination.
- No login, no browser, no rate-limiting signals observed (no 403/429; Dailymotion public API returns no rate-limit headers). Random 200-700ms delay before each request is a courtesy.

## Capture Assessment

Captured. The path is fully verified and stable: the public API is anonymous, rate-limit-free, and covers both channel video streams and site-wide trending. The command is parameterizable (channel/sort/limit) and chainable (`id`/`url` feed `dailymotion/get-video`). The browser channel page is broken, so the node/API route is the only reliable source.
