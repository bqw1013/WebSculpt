# Evidence: devto/list-articles

This document records the research and validation evidence for the `devto/list-articles` command.

## Exploration Path

- Explored the WebSculpt command library: no existing `devto` domain commands.
- Read `websculpt-explore/references/access/playwright-cli-guide.md` before browser automation.
- Verified the Forem API as the primary source and the DEV.to public pages as the fallback source.
- Confirmed the browser extraction path with Playwright CLI attached to a local browser session.

## Verified URLs

- `https://dev.to/api/articles?per_page=2`
- `https://dev.to/api/articles?per_page=2&username={user}`
- `https://dev.to/api/articles?per_page=2&tag={tag}`
- `https://dev.to/api/articles?per_page=2&page=99999`
- `https://dev.to/api/articles?per_page=2&username={nonexistent_user}`
- `https://dev.to/{user}`
- `https://dev.to/t/{tag}`
- `https://dev.to/{nonexistent_user}`
- `https://dev.to/t/{nonexistent_tag}`

## Structural Evidence

### API path

- Endpoint: `GET https://dev.to/api/articles`
- Query parameters validated: `page`, `per_page`, `tag`, `tags`, `tags_exclude`, `username`, `state`, `top`, `collection_id`.
- Successful response is a JSON array of article objects.
- Key fields: `id`, `title`, `description`, `path`, `url`, `published_at`, `published_timestamp`, `reading_time_minutes`, `tag_list`, `tags`, `comments_count`, `public_reactions_count`, `positive_reactions_count`, `cover_image`, `user`, `organization`, `flare_tag`.
- Empty result for non-existent user: HTTP 200 with `[]`.
- Invalid endpoint path: HTTP 404 HTML page.

### Browser fallback path

- User profile page: `https://dev.to/{user}`
  - Article cards: `article.crayons-story`
  - Title/link: `a.crayons-story__hidden-navigation-link`
  - Publish time: `time` element text
  - Author: `a[href^="/@"]`
  - Tags: `a.crayons-tag` or `a[href^="/t/"]`
  - Reactions: `.multiple_reactions_aggregate` text content
  - Comments: regex match `\d+\s*comments?` within card text
- Tag page: `https://dev.to/t/{tag}`
  - Same `article.crayons-story` cards
  - Reactions/comments are not rendered in the tag feed; reading time is present (e.g. "7 min read")
- Non-existent user or tag returns a 404 page with title `404: Page Not Found` and body text containing "Looks like this page doesn't exist".

## Failure Signals

- API returns non-2xx status (429, 5xx, network failure) -> trigger browser fallback.
- API returns 200 with empty array -> `EMPTY_RESULT`.
- Browser page title contains `404` or body contains "doesn't exist" -> `NOT_FOUND`.
- Browser fails to attach -> runner returns `BROWSER_ATTACH_REQUIRED`.
- Expected selectors not found after navigation -> `DRIFT_DETECTED`.

## Capture Assessment

This command should be captured. Both the API path and the browser fallback path have been validated with real requests and DOM extraction. The command is reusable for listing DEV.to articles by user, tag, or site-wide feed, with clear parameterization and error handling.
