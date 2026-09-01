# Evidence: devto/search

This document records the research and validation evidence for the `devto/search` command.

## Exploration Path

- Command library checked: `devto/search` did not exist; related commands (`get-article`, `list-articles`, etc.) already present.
- Browser automation guide read: `references/access/playwright-cli-guide.md`.
- Verified both the public Forem API endpoint and the DEV.to search page.

## Verified URLs

- `https://dev.to/api/articles/search?q=<query>`
- `https://dev.to/search?q=<query>`
- `https://dev.to/search?q=<query>&sort_by=published_at&sort_direction=desc`
- `https://dev.to/search?q=<query>&sort_by=published_at&sort_direction=asc`

## Structural Evidence

### API path

- Endpoint: `GET https://dev.to/api/articles/search?q=<query>`
- Query params that work: `q`, `page`, `per_page`
- Query params that are ignored: all sort variants (`sort_by`, `sort`, `sort_direction`)
- Response: JSON array of article objects
- Key fields: `id`, `title`, `description`, `url`, `path`, `slug`, `tag_list`, `tags`, `published_at`, `created_at`, `comments_count`, `public_reactions_count`, `positive_reactions_count`, `reading_time_minutes`, `cover_image`, `user`
- `user` fields: `name`, `username`, `github_username`, `twitter_username`, `profile_image`, `profile_image_90`, `website_url`, `user_id`

### Browser path

- Page: `https://dev.to/search?q=<query>`
- Result card selector: `article.crayons-story`
- Title selector inside card: `h3 a`
- Author link selector: `a.crayons-story__secondary`
- Tag selector: `a.crayons-tag`
- Date selector: `time`
- Reading time: text match `\d+ min read`
- Comments link: anchor whose `href` contains `#comments`
- Sort navigation: `nav[aria-label="Search result sort options"]` with links `Most Relevant`, `Newest`, `Oldest`
- Sort URL params:
  - newest: `sort_by=published_at&sort_direction=desc`
  - oldest: `sort_by=published_at&sort_direction=asc`

## Failure Signals

- API empty / no-match query returns HTTP 500 with body `{"status":500,"error":"Internal Server Error"}`
- API without `q` returns default featured articles (not an error)
- Browser empty result: `article.crayons-story` count is 0
- Browser missing query: also 0 cards
- Browser cards do not display reaction counts
- Browser date text is relative (e.g. `Aug 26`, `Aug 2 '19`)

## Capture Assessment

This command should be captured. The search page is a primary DEV.to entry point, and the API-first + browser-fallback path provides reliable article search even when the API returns 500 for unmatched queries.
