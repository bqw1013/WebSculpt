# Evidence: devto/list-videos

This document records the research and validation evidence for the `devto/list-videos` command.

## Exploration Path

- Checked the WebSculpt command library: `devto` domain exists with 5 commands (`get-article`, `get-organization`, `get-user`, `list-articles`, `list-tags`), but no `list-videos` command.
- Read the browser runtime contract and the explore-stage `playwright-cli-guide.md` before using browser automation.
- Verified the API-first path with `curl` against `https://dev.to/api/videos`.
- Verified the browser fallback path by attaching a Playwright CLI session to the local browser and navigating to `https://dev.to/videos`.

## Verified URLs

- `https://dev.to/api/videos`
- `https://dev.to/api/videos?per_page=3`
- `https://dev.to/api/videos?per_page=3&page=2`
- `https://dev.to/api/videos?per_page=1000`
- `https://dev.to/api/videos?per_page=1001`
- `https://dev.to/api/videos?per_page=abc`
- `https://dev.to/api/videos?page=9999&per_page=3`
- `https://dev.to/videos`
- `https://dev.to/t/ai/videos`
- `https://dev.to/t/this-tag-does-not-exist-xyz12345/videos`

## Structural Evidence

### API path (`GET /api/videos`)

Response is a JSON array of `video_article` objects. Example fields:

```json
{
  "type_of": "video_article",
  "id": 4527169,
  "path": "/<user_path_segment>/<article_slug>",
  "cloudinary_video_url": null,
  "video": "https://www.youtube.com/embed/<video_id>",
  "title": "<video_title>",
  "user_id": 4101116,
  "video_duration_in_minutes": "00:00",
  "video_source_url": "https://youtu.be/<video_id>",
  "user": { "name": "<author_name>" }
}
```

Observed behavior:
- `per_page` upper bound is 1000. Values above 1000 are capped to 1000.
- `per_page=-1` falls back to the default (25 items).
- `per_page=abc` returns an empty array.
- `page=9999` returns an empty array.
- `tag=ai` returns a filtered list matching the `/t/ai/videos` page.
- `tag=<nonexistent>` returns an empty array.
- The endpoint is part of the V0 (beta) API and requires no authentication.

### Browser fallback path (`/videos`)

Video cards are rendered as:

```html
<a href="/<user_path_segment>/<article_slug>" id="video-article-<id>" class="crayons-card media-card">
  <div class="crayons-article__cover">
    <iframe src="https://www.youtube.com/embed/<video_id>" ...></iframe>
  </div>
  <div class="media-card__content">
    <h2 class="fs-base mb-2 fw-medium"><video_title></h2>
    <small class="fs-s"><author_name></small>
  </div>
</a>
```

Extraction selectors:
- Card container: `a.crayons-card.media-card`
- Article ID: parse from `id="video-article-<id>"`
- Title: `.media-card__content h2.fs-base.mb-2.fw-medium`
- Author: `.media-card__content small.fs-s`
- YouTube embed URL: `iframe[src]` inside the card
- Article path: `href` attribute

Browser-only observations:
- The page does not render actual video duration, so the command omits `video_duration_in_minutes` entirely.
- The `/t/<tag>/videos` page uses the same selectors, but an invalid tag does not produce an empty result; it falls back to showing all videos. Therefore the command does not expose a `tag` parameter.

## Failure Signals

- API returns HTTP 429 → `RATE_LIMITED`.
- API returns HTTP 5xx or non-JSON → trigger browser fallback.
- API endpoint 404 (e.g., `/api/videos-invalid`) → `NETWORK_ERROR` (path drift).
- API returns `[]` → `EMPTY_RESULT`.
- Browser page title contains "404" or body contains "Page Not Found" → `NOT_FOUND`.
- Browser cannot attach → runner produces `BROWSER_ATTACH_REQUIRED`.
- Missing or invalid `limit` → `INVALID_PARAM`.

## Capture Assessment

This command should be captured. The API path is public, fast, and stable; the browser fallback path uses simple, verified selectors. Both paths yield the same core fields (title, author, article URL, YouTube embed URL). The command fills a clear gap in the existing `devto` command family.
