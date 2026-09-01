# Context

## Precipitation Background

DEV.to has a dedicated `/videos` page that lists community posts containing embedded YouTube videos. The existing `devto` command family covered articles, users, organizations, tags, and comments, but did not cover video articles. This command fills that gap.

## Value Assessment

- High reuse value for anyone looking for video content on DEV.to.
- Public API path is fast and requires no authentication.
- Browser fallback provides resilience when the API is rate-limited or temporarily unavailable.

## Page Structure

### API path

- Endpoint: `GET https://dev.to/api/videos?per_page=<limit>`
- Returns a JSON array of `video_article` objects.
- Key fields: `id`, `title`, `path`, `video`, `video_source_url`, `user_id`, `user.name`.
- `video_duration_in_minutes` is present in the raw response but its value is consistently `"00:00"`, so the command omits it.

### Browser fallback path

- URL: `https://dev.to/videos`
- Card container: `a.crayons-card.media-card`
- Article ID: parsed from `id="video-article-<id>"`
- Title: `.media-card__content h2.fs-base.mb-2.fw-medium`
- Author: `.media-card__content small.fs-s`
- YouTube embed URL: `iframe[src]` inside the card
- Article path: `href` attribute

## Environment Dependencies

- API path: no authentication, no browser required.
- Browser path: requires a browser with remote debugging enabled. The command does not launch a new browser; it attaches to the local browser via WebSculpt daemon.
- Built-in pacing: random small scroll + delay in browser path.

## Failure Signals

- API returns 429 → `RATE_LIMITED`.
- API returns 5xx or non-JSON → trigger browser fallback.
- API returns an empty array → `EMPTY_RESULT`.
- Browser page title/body indicates 404 → `NOT_FOUND`.
- Target selectors return no cards → `EMPTY_RESULT` or `DRIFT_DETECTED` if the page structure has changed.
- Browser cannot attach → `BROWSER_ATTACH_REQUIRED` (raised by runner).

## Repair Clues

- If `a.crayons-card.media-card` no longer matches, look for `article` or `div` cards with `media-card` class.
- If YouTube iframe `src` is missing, check whether the page now lazy-loads the embed.
- If the API endpoint changes, try the V1 API header `Accept: application/vnd.forem.api-v1+json`.
