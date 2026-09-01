# Context

## Precipitation Background

DEV.to comments are a common follow-up need after discovering an article. The existing `devto/get-article` command does not expose comments, so a dedicated `get-comments` command is needed to retrieve discussion threads by article URL or id.

## Value Assessment

- Reuse value: high. Comments are frequently consulted after reading an article.
- Generality: works for any public DEV.to article.
- Time saved: avoids manually navigating to the comments section and copying content.

## Page Structure

- API primary:
  - `GET https://dev.to/api/comments?a_id={article_id}`
  - `GET https://dev.to/api/articles/{username}/{slug}` (for URL-to-id resolution)
- Browser fallback:
  - Article page: `https://dev.to/{username}/{slug}`
  - Comments section: `#comments`
  - Top-level comment: `#comments .single-comment-node.root`
  - Reply: `#comments .single-comment-node:not(.root)` inside `.comment__children`
  - Body: `.comment__body`
  - Timestamp: `time[datetime]`
  - Author avatar: `img`
  - Comment id_code: `data-path` attribute or `<a name="comment-{id_code}">`
  - Article id: `#article-show-container[data-article-id]`
  - Comment count: `.js-comments-count[data-comments-count]`

## Environment Dependencies

- No login required.
- Browser runtime requires a browser with remote debugging enabled.
- The public Forem API is anonymous and does not require an API key.

## Failure Signals

- Selectors returning no nodes when comments are expected → possible page structure drift.
- API returns non-JSON or unexpected shape → `NETWORK_ERROR`.
- API 429 → `RATE_LIMITED`; browser fallback is attempted.
- Browser page title starts with `404:` or body contains "doesn't exist" → `NOT_FOUND`.
- Browser renders fewer comments than API → expected; output marks `truncated: true`.

## Repair Clues

- If the API endpoint changes, check the new path for `/api/comments` and the article resolution endpoint `/api/articles/{username}/{slug}`.
- If the page DOM changes, re-verify selectors `#comments .single-comment-node.root`, `.comment__body`, `time[datetime]`, and `data-path`.
