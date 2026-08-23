# Context

## Precipitation Background (Why This Command Exists)

Part of the GitHub command batch. After discovering topics via `github/list-topics`, users need the topic page's featured repositories. `github/get-topic` returns the topic description plus the up-to-20 featured repo cards, chaining into downstream commands (`full_name`/`html_url` feed `github/list-repos` / `github/get-repo`). All github commands in this batch are browser runtime because the REST API has aggressive anonymous rate limits.

## Value Assessment

- High reuse: topic page is a common GitHub discovery entry; featured repos are the canonical per-topic ranking.
- Browser runtime avoids REST API quota entirely; pure SSR page means extraction is a single same-origin fetch (~1-3s), well under the 10s target.
- Parameterizable: `topic` (required) + `limit` (truncation only).

## Page Structure

- URL: `https://github.com/topics/{topic}` (slug normalized to lowercase by GitHub 302 redirect; command validates lowercase input).
- Pure SSR. Parse raw HTML via same-origin `fetch(location.pathname + location.search, {credentials:'same-origin'})` + `DOMParser`.
- Header: `h1.h1` (display_name), `.markdown-body.f5` (description).
- Cards: `article.border.rounded.color-shadow-small.color-bg-subtle.tmp-my-4` — fixed 20 per page, no lazy-load on scroll.
- Card fields: `a.Link.text-bold.wb-break-word` (full_name/html_url), `p.color-fg-muted.mb-0` (description), `span[itemprop="programmingLanguage"]` (language), `span[id^="repo-stars-counter-star"]` `title` attribute (exact stars).
- Empty topic: `div.f3.color-fg-muted.lh-condensed` "…hasn't been used on any public repositories, yet." + `a.btn.btn-primary` "Explore topics", 0 cards.

## Environment Dependencies

- Requires Chrome/Edge running with remote debugging enabled; no login required (`authRequired: not-required`).
- Rate awareness: random mouse move/wheel + 120-350ms random wait per call; no REST API usage; request-light.
- The hydrated DOM may show transient `INCLUDE-FRAGMENT` side-widget errors ("Uh oh! There was an error while loading.") under shared-browser load — these are in `.blankslate` side widgets, NOT the repo list; never use them as empty/error signals.

## Failure Signals

- `INVALID_PARAM` — topic not matching `^[a-z0-9][a-z0-9-]*$`, or limit not integer 1-100.
- `NOT_FOUND` — HTTP 404 or `title` contains `Page not found`.
- `EMPTY_RESULT` — HTTP 200, 0 cards, empty-state message present.
- `DRIFT_DETECTED` — HTTP 200, 0 cards, empty-state message absent (structure changed).
- `NETWORK_ERROR` — HTTP 429/403 or body/title matching `/whoa there|captcha|rate limit|access denied|unusual traffic/i`, or page.goto/fetch rejection.

## Repair Clues

- If the `article.border...tmp-my-4` selector drifts, the repo cards likely changed class names; inspect the raw SSR HTML for a new card container and update both `command.js` and this file.
- If `h1.h1`/`.markdown-body.f5` drift, fall back to `topic-feeds-toast-trigger[data-topic-name]` for slug and any `markdown-body` for description.
- Backup data path: the REST API (`https://api.github.com/topics/{topic}` requires auth; anonymous is not viable) — keep the SSR fetch approach.
