# Evidence: devto/get-article

This document records the research and validation evidence for the `devto/get-article` command.

## Exploration Path

- Checked the WebSculpt command library with `websculpt command domains` and `websculpt command list devto`; no existing DEV.to commands were found.
- guide-read: completed — read the browser runtime contract and the Playwright CLI exploration guide before any browser automation.
- Validated the Forem public API as the primary source.
- Validated the public DEV.to article HTML page as the fallback source when the API cannot be used.

## Verified URLs

- `https://dev.to/api/articles/{username}/{slug}` — API success sample (HTTP 200).
- `https://dev.to/api/articles/{username}/non-existent-article-99999` — API not-found sample (HTTP 404).
- `https://dev.to/{username}/{slug}` — browser extraction sample (organization post).
- `https://dev.to/{username}/{slug}` — browser extraction sample (user-only post, no organization).
- `https://dev.to/{username}/non-existent-article-99999` — browser 404 sample.

## Structural Evidence

### API path

- Endpoint: `GET https://dev.to/api/articles/{username}/{slug}`.
- The `{username}` and `{slug}` are taken from the input URL path (`/username/slug`).
- On success the response is a JSON object with fields such as `id`, `title`, `description`, `slug`, `path`, `url`, `published_timestamp`, `tags`, `tag_list`, `body_html`, `body_markdown`, `user`, `organization`, `cover_image`, `public_reactions_count`, `comments_count`, `reading_time_minutes`, etc.
- HTTP 404 returns `{"error":"not found","status":404}` and should be reported as `NOT_FOUND`.
- HTTP 429 and 5xx responses, plus network or JSON parse failures, trigger the browser fallback.

### Browser fallback path

After navigating to the article URL, the following DOM structure is stable:

- Article container: `article.crayons-card.crayons-article`.
- Header: `header.crayons-article__header`.
  - Title: `h1` inside the header.
  - Cover image: `.crayons-article__cover img` `src`.
  - Meta block: `.crayons-article__header__meta`.
    - Author link: `a.crayons-link.fw-bold` (href `/username`, text is display name).
    - Organization link: second `a.crayons-link` when the meta block contains the text "for" (href `/orgname`).
    - Publish time: `time[datetime]`.
- Tags: `a[href^="/t/"]` inside the article; text contains a leading `#` and newline that must be stripped.
- Body: `#article-body` (class `crayons-article__body`); its `data-article-id` attribute holds the numeric article id; `innerHTML` is the article body HTML.

A 404 page has title `404: Page Not Found` and an `h1` containing "Looks like this page doesn't exist or may not be published."

## Failure Signals

- API HTTP 404 → `NOT_FOUND`.
- API HTTP 429, 5xx, network error, or unparseable JSON → browser fallback.
- Browser page title starts with `404:` or article container missing → `NOT_FOUND`.
- Browser article container exists but title and body are empty → `EMPTY_RESULT`.
- Browser navigation failure (e.g. connection error) → `NETWORK_ERROR`.
- Failure to attach to the browser is handled by the runner and surfaced as `BROWSER_ATTACH_REQUIRED`.

## Capture Assessment

This command should be captured because:

- The Forem API path is fast and returns rich structured data.
- The browser fallback uses stable, verified DOM selectors and provides the most important article fields when the API is unavailable.
- The input is a single public URL; the command is reusable for any DEV.to article.
