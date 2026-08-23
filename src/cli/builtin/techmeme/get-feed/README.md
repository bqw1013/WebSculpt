# techmeme/get-feed

## Description

Fetch Techmeme's curated front-page news feed — the story clusters editors pick each day. Each cluster item carries the primary report (title / summary / source / author / permalink / image) plus its **"More:" related coverage**, its **social discussion groups** (X, LinkedIn, Bluesky, Mastodon, Forums), and the **official Techmeme social posts** for that story (X / Mastodon / Threads / Bluesky / tweet id).

Items are returned in editorial priority order (`section`: `top` → `more` → `earlier`). An optional `--date YYYY-MM-DD` reviews that day's historical snapshot (default is today's homepage). The feed is served as static HTML to anonymous clients — no login, no browser, no API key. Runtime: `node`.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `limit` | no | `20` | Maximum stories to return (1-100). The page holds a fixed number of clusters (homepage ~43, snapshots ~31); requesting more than available returns all of them with `partial: true` on every item. |
| `date` | no | today | Historical snapshot date in `YYYY-MM-DD`. Omitted or today uses the homepage; a past date resolves to the site's `{yymmdd}/h2000` snapshot, falling back to `h1130` then `h0000`. Raises `NOT_FOUND` when the date has no snapshot. |

## Return Value

The command returns an **array** of story objects, ordered by editorial priority (`top` → `more` → `earlier`):

```json
[
  {
    "title": "OpenAI changed safety practices and paused RL training ...",
    "summary": "OpenAI said Tuesday that it has made several changes ...",
    "source": { "name": "Axios", "url": "https://www.axios.com/" },
    "author": "Ina Fried",
    "url": "https://www.axios.com/2026/08/18/openai-pause-astra-preparedness-framework",
    "permalink": "https://www.techmeme.com/260818/p29",
    "image": "https://www.techmeme.com/260818/i29.jpg",
    "section": "top",
    "related": [
      { "source": "OpenAI", "url": "https://openai.com/index/pacing-model-development-cyber-capabilities" }
    ],
    "discussions": {
      "x": [ { "label": "@sama", "url": "https://x.com/sama/status/2089785307315200028" } ],
      "linkedin": [],
      "bluesky": [],
      "mastodon": [],
      "forums": []
    },
    "social_posts": {
      "x": "https://twitter.com/Techmeme/status/2089777056506859888",
      "mastodon": "https://techhub.social/@Techmeme/117117855404934764",
      "threads": "https://www.threads.com/@techmeme/post/DcMOcn7GLHQ",
      "bluesky": "https://bsky.app/profile/techmeme.com/post/3mtesujt2wy27",
      "twid": "2089777056506859888"
    }
  }
]
```

Field notes:

- `section`: `"top"` | `"more"` | `"earlier"` — editorial section. Sponsor Posts / Featured Podcasts / Newest are excluded.
- `summary`, `author`, `image`: `null` when the item lacks them (about 44% have no summary, 47% no image).
- `social_posts`: each of `x`/`mastodon`/`threads`/`bluesky`/`twid` is `null` when the item lacks that official post (occasionally one is missing).
- `permalink`: built from the story's own pml id (`https://www.techmeme.com/{yymmdd}/p{N}`), never the page date — a snapshot can show stories from earlier days. This is the input to `techmeme/get-story`.
- `partial`: present (`true`) on every item only when the page held **fewer** stories than the requested `limit` (e.g. `--limit 100` on a 43-story homepage).

## Usage

```
websculpt techmeme get-feed
websculpt techmeme get-feed --limit 50
websculpt techmeme get-feed --limit 5
websculpt techmeme get-feed --date 2026-08-15
websculpt techmeme get-feed --date 2026-08-15 --limit 10
```

## Common Error Codes

| code | meaning |
|------|---------|
| `INVALID_PARAM` | `limit` is not a positive integer 1-100, or `date` is not a valid `YYYY-MM-DD` calendar date. |
| `NOT_FOUND` | `--date` has no Techmeme snapshot (h2000/h1130/h0000 all 404). |
| `RATE_LIMITED` | Techmeme returned 403/429 (rate limit). |
| `API_ERROR` | Unexpected HTTP status, or a 200 page with no story clusters (structure likely changed). |
| `NETWORK_ERROR` | Fetch failed / timed out / network unreachable. |
