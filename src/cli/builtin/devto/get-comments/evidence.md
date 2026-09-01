# Evidence: devto/get-comments

This document records the research and validation evidence for the `devto/get-comments` command.

## Exploration Path

- Checked the WebSculpt command library: `devto/get-article`, `devto/get-organization`, `devto/get-user`, `devto/list-articles`, `devto/list-tags` exist; `devto/get-comments` does not.
- Read `.agents/skills/websculpt-explore/references/access/playwright-cli-guide.md` before browser automation.
- Verified the Forem public API endpoint for comments and the browser-based fallback extraction path on the article page.

## Verified URLs

- `https://dev.to/api/comments?a_id={article_id}`
- `https://dev.to/api/articles/{username}/{slug}`
- `https://dev.to/{username}/{slug}` (article page, `#comments` section)

## Structural Evidence

### API path

- `GET /api/comments?a_id={article_id}` returns an array of top-level comments. Each comment object includes:
  - `type_of`: always `"comment"`
  - `id_code`: short alphanumeric comment identifier
  - `created_at`: ISO 8601 timestamp
  - `ai_disclosure_level` / `ai_disclosure_label`: optional AI disclosure metadata
  - `body_html`: rendered HTML body
  - `user`: author object with `name`, `username`, `twitter_username`, `github_username`, `user_id`, `website_url`, `profile_image`, `profile_image_90`
  - `children`: array of nested replies with the same shape
- The endpoint returns the full list of top-level comments; `limit`, `page`, and `per_page` query parameters are not honored server-side.
- Non-existent article returns HTTP 404 with body `{"error":"not found","status":404}`.
- Article with no comments returns HTTP 200 with body `[]`.

### URL-to-ID resolution

- Article URLs use the form `https://dev.to/{username}/{slug}` and do not contain the numeric article id.
- `GET /api/articles/{username}/{slug}` resolves the URL to the article object, returning `id`, `url`, and `comments_count`.
- Non-existent slug returns HTTP 404 with body `{"error":"not found","status":404}`.

### Browser fallback path

- Comments are rendered inside `#comments`.
- Each top-level comment is a `.single-comment-node.root` element.
- Each nested reply is a `.single-comment-node` inside `.comment__children`.
- Comment body: `.comment__body`
- Comment timestamp: `time[datetime]`
- Author link: first anchor inside the comment node
- Author avatar: `img` inside the comment node
- Comment `id_code`: parsed from `data-path="/{username}/{slug}/comments/{id_code}"` or from the anchor `<a name="comment-{id_code}">`.
- Numeric article id: `document.querySelector('#article-show-container').getAttribute('data-article-id')`.
- Comment count: `.js-comments-count` element has `data-comments-count`.
- The browser page renders a subset of comments (default "Top" sort). Scrolling does not load more comments; there is no visible "load more" control. Therefore browser fallback is marked as `truncated: true`.

## Failure Signals

- `INVALID_PARAM`: missing both `article_url` and `article_id`, both provided, malformed URL, or `limit` out of range.
- `NOT_FOUND`: API 404 on either `/api/articles/{username}/{slug}` or `/api/comments?a_id={id}`, or browser page title starts with `404:` / body contains "doesn't exist".
- `EMPTY_RESULT`: article exists but `comments_count === 0` or comments API returns `[]`.
- `RATE_LIMITED`: API returns HTTP 429.
- `NETWORK_ERROR`: API 5xx, fetch failure, or non-JSON response.
- `BROWSER_ATTACH_REQUIRED`: browser navigation fails with attach/browser related message.

## Capture Assessment

This command should be captured. The API path is public, stable, and returns structured nested comments. The browser fallback covers cases where the API is unavailable, with the documented limitation that only a rendered subset of comments is returned.
