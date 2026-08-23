# Context

## Precipitation Background (Why This Command Exists)

A user wants to browse Dailymotion by topic channel (animals, music, tech, ...) — the site's fixed 17-channel taxonomy — plus the site-wide trending stream. Explore (2026-08-18) found the browser topic-channel pages `/channel/{slug}` are **broken**: the client router redirects to `/user/channel/{slug}`, which renders a generic "channel" account (xid `x2pe0lr`) with an empty video grid, while the SSR `<title>` localizes the slug correctly. The public REST API (`api.dailymotion.com`) provides both channel video streams and site-wide trending reliably and anonymously, so the command reads the API. The plan originally said browser; the user confirmed the node deviation.

## Value Assessment

- High generality: any of the 17 topic channels can be browsed with any of 3 orderings, plus site-wide trending by omitting `--channel`.
- Reuse frequency: high — browsing a channel feed or the global trending stream is a core Dailymotion workflow.
- Time saved: API paging (dotted-key parsing `v["owner.screenname"]`, `views_total` nullable, `total` capped at 1000) and relative-time formatting are encapsulated.
- Chainable: each card's `id`/`url` feeds `dailymotion/get-video`.

## Page Structure

Programmatic source (no browser): `https://api.dailymotion.com`

- Channel video stream: `GET /channel/{slug}/videos?sort={trending|visited|recent}&fields={...}&limit={n}&page={p}`.
- Site-wide trending: `GET /videos?sort={trending|visited|recent}&fields={...}&limit={n}&page={p}`. Omitting `--channel` uses this with default `sort=trending`.
- Fields: `id,title,url,duration,thumbnail_240_url,owner.screenname,created_time,views_total`.
- **Dotted fields are literal single keys**: `owner.screenname` is accessed as `v["owner.screenname"]`, NOT `v.owner.screenname`.
- Pagination: `total` capped at 1000, `has_more` boolean, `limit` up to 100 per page.
- The 17 slugs and English names are hard-coded in `CHANNEL_NAMES` (verified from `/channels`); the browser page title for each slug localizes (e.g. music=音樂和歌曲視頻) but content is not rendered there.

## Environment Dependencies

- No login, no browser — public anonymous API.
- Rate limiting: no rate-limit headers observed (50 consecutive requests all HTTP 200 in explore). As a courtesy the command sleeps a random 200-700ms before each API request.
- Node runtime: only global `fetch` + built-ins (no third-party modules, no inline import).

## Failure Signals

- HTTP non-200 or network abort → `REQUEST_FAILED`.
- `channel` not in the 17-slug map → `INVALID_PARAM`.
- `sort` not in `trending|visited|recent` → `INVALID_PARAM`.
- `limit` raw string not `^\d+$` or outside 1-100 → `INVALID_PARAM` (regex check before parseInt, so `"20abc"` is rejected rather than truncated).
- `data.list` missing/empty while `has_more` stays true → the loop guard `hasMore = has_more === true && list.length > 0` stops pagination (drift guard).

## Repair Clues

- If a channel's stream ever stops matching the site, re-check `/channels` for the 17 slugs/names and update `CHANNEL_NAMES`.
- If the dotted-key shape changes (e.g. the API starts returning a nested `owner` object), update `mapVideo` accordingly.
- The alternative endpoint `GET /videos?channel={slug}&sort={sort}` returns identical data — a viable fallback if `/channel/{slug}/videos` regresses.
