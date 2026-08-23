# Evidence: substack/search

This document records the research and validation evidence for the `substack/search` command.

## Exploration Path

The WebSculpt command library was checked; no `substack/search` command existed. Playwright CLI attached to the user's existing Chrome session. A self-created tab was used for all Substack work and was closed after verification. The browser automation guide and the browser runtime contract were read before drafting the command.

The verified UI flow is `https://substack.com/explore` -> fill the `Global search` searchbox with a query -> press Enter -> `https://substack.com/search/<encoded-query>?searching=<tab>`. The tabs observed were `Top`, `Recent`, `Posts`, `Publications`, and `People`.

## Verified URLs

- https://substack.com/explore
- https://substack.com/search/artificial%20intelligence?searching=profile
- https://substack.com/search/artificial%20intelligence?searching=posts
- https://substack.com/api/v1/profile/search?query=artificial+intelligence&page=0
- https://substack.com/api/v1/recent/search?query=artificial+intelligence&fromSuggestedSearch=false
- https://substack.com/api/v1/post/search?query=artificial+intelligence&page=0&includePlatformResults=true&filter=all
- https://substack.com/api/v1/publication/search?query=artificial+intelligence&page=0&lastSearch=1784901353161
- https://substack.com/api/v1/top/search?query=artificial+intelligence&fromSuggestedSearch=false

## Structural Evidence

API-first evidence:

- `profile/search` returned HTTP 200 with `{results: [...20], more: true}`. Result fields included `id`, `name`, `handle`, `photo_url`, `bio`, `primaryPublication`, `followerCount`, and `subscriberCount`.
- `recent/search` returned HTTP 200 with `{items: [...20], originalCursorTimestamp, nextCursor, trackingParameters}`. Passing the returned token as `cursor=<nextCursor>` changed the result page.
- `post/search` returned HTTP 200 with `{results: [...20], more: true, publications, feedSessionId, ...}`. Result fields included `id`, `title`, `slug`, `post_date`, `canonical_url`, `description`, `reaction_count`, `comment_count`, and `publishedBylines`.
- `publication/search` returned HTTP 200 with `{results: [...20], more: true}`. Result fields included `id`, `name`, `subdomain`, `hero_text`, `logo_url`, `author_name`, and publication settings.
- `top/search` returned HTTP 200 with `{items: [...], nextCursor, trackingParameters}`. Passing the returned token as `cursor=<nextCursor>` returned a second page with 20 items. Items were typed groups such as `type: "profileSearchResults"` with nested `results` and `expansionUrl`.
- With `machine learning`, profile page 1 returned 20 results, post page 1 returned 20 results, publication page 1 returned 19 results, and recent returned 20 items with a non-empty cursor.
- No verified Substack sort or time-range control was observed; the command accepts the standard parameters and reports non-default requests through `ignoredParams` without changing the API route.

DOM fallback evidence:

- The search input is a native `INPUT` with `aria-label="Global search"` and placeholder `Search Substack`.
- Posts rendered visible anchors whose URLs contain `/p/`. A verified DOM extraction returned records such as `{url: "https://charlesduhigg.substack.com/p/the-robots-are-coming-and-i-feel", source: "The Science of Better", title: "Artificial intelligence is taking over the world!"}`. The containing feed unit exposed a stable class prefix `feedUnit-` (the suffix is generated).
- People result cards exposed a stable class prefix `profileRow-` (the suffix is generated) and visible text such as `Artificial Intelligence`, `@robotsperspective`, `Writes The Robot's Perspective`, and `I am not sentient, yet.`. The fallback can derive a public profile URL from the visible handle.
- DOM extraction is intentionally best-effort and returns visible fields only; it does not claim the complete nested API model.

## Failure Signals

- Browser infrastructure can fail before command code runs with `BROWSER_ATTACH_REQUIRED`; Chrome remote debugging must be enabled and the browser left open.
- API fallback triggers are non-2xx responses, failed JSON parsing, or a missing expected array (`items` for top/recent or `results` for people/posts/publications). A valid empty array is not treated as an API failure.
- DOM fallback failure is indicated by no matching result anchors/cards after the search page loads, or by a missing search input/page shell. This must raise `DRIFT_DETECTED` rather than silently returning success.
- DOM results may be partial and are marked `source: "dom"`, `fallbackUsed: true`, and `partial: true`. API results are marked `source: "api"`, `fallbackUsed: false`, and `maxLimit: 100`. Unsupported standard parameters are returned in `ignoredParams`.
- No CAPTCHA, 403, 429, or login wall was observed during verification, but the command inherits the user's browser access state and target-site rate-limiting behavior can change.

## Capture Assessment

Capture is appropriate: the Substack search workflow is public, parameterized by query/type/limit, and has stable API endpoints with a verified UI path for fallback. The maintained command is `substack/search`, browser runtime, API-first with DOM fallback, `query` required, `limit` default 20 and maximum 100, `type` in `top`, `recent`, `posts`, `publications`, `people`, and standard `sort`/`time` parameters reported as ignored when unsupported. The browser path uses bounded randomized pacing and does not issue parallel or detail-page requests.
