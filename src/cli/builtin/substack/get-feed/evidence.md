# Evidence: substack/get-feed

This document records the research and validation evidence for the `substack/get-feed` command.

## Exploration Path

- Checked the WebSculpt command library: existing `substack/get-trending`, `substack/get-trending-topics`, and `substack/search` commands all use browser runtime; no existing `substack/get-feed` command.
- Read the WebSculpt browser runtime guide and capture contract.
- Used a Playwright CLI session to attach to the user's Chrome and explore Substack pages.
- Compared DOM extraction vs internal API calls; internal APIs return structured JSON and are more stable than hashed CSS class names, so the command uses browser runtime with in-page `fetch`.

## Verified URLs

- `https://substack.com/` — personal "For you" feed landing page.
- `https://substack.com/api/v1/reader/feed?tab=for-you&type=base` — personal feed API.
- `https://substack.com/explore` — category explore landing page.
- `https://substack.com/explore/category/technology` — category feed default view.
- `https://substack.com/explore/category/technology?sort=recent` — category feed sorted by recent.
- `https://substack.com/explore/category/technology?sort=posts` — category feed showing long-form posts.
- `https://substack.com/api/v1/reader/feed/tabs?surface=explore&selectedTab=technology&type=category` — category tabs/slugs API.
- `https://substack.com/api/v1/search/explore/web?tab=technology&type=category&sort=recent` — category feed content API.

## Structural Evidence

### Personal feed API
- Endpoint: `GET https://substack.com/api/v1/reader/feed?tab=for-you&type=base`
- Response keys: `items`, `originalCursorTimestamp`, `nextCursor`, `trackingParameters`.
- Item types observed: `"comment"` (short notes), `"post"` (long-form articles), `"userSuggestions"`.
- Pagination: pass `cursor=<nextCursor>` for the next page.

### Category feed API
- Endpoint: `GET https://substack.com/api/v1/search/explore/web?tab=<slug>&type=category&sort=<sort>`
- `<sort>` values verified: `recent`, `posts`. Default page (no `sort`) corresponds to the "Top" tab.
- Response keys: `items`, `originalCursorTimestamp`, `nextCursor`, `trackingParameters`, `tabs`.
- Item types observed: `"categoryLeaderboard"`, `"comment"`, `"post"`.
- Pagination: pass `cursor=<nextCursor>` for the next page.
- `limit`, `offset`, `page` query parameters are ignored by the server.

### Category slug list
Retrieved 50 category slugs from the tabs API:

```
technology, us-politics, political-philosophy, hobbies-interests, us-government-policy,
football-(soccer), programming-development, investigative-journalism, physics-chemistry,
online-learning, software-apps, video-games, local-news, k-12-education, sports,
health-politics, national-news, international, cultural-commentary, us-political-satire,
sustainable-living, banking-credit, marketing, photography, ux/ui-design, comics, humor,
travel, business, fiction, literature, faith, world-politics, food, fashionandbeauty,
design, music, culture, history, finance, news, film-and-tv, art, climate, parenting,
science, health, home-garden, crypto, philosophy, education
```

### Item normalization
- Post item:
  - `item.post.title`, `item.post.subtitle`, `item.post.slug`, `item.post.post_date`
  - `item.post.comment_count`, `item.post.restacks`
  - `item.publication.name`, `item.publication.subdomain`
  - author from `item.context.users[0]` (`name`, `handle`)
  - URL: `https://<subdomain>.substack.com/p/<slug>`
- Note item (`type === "comment"`):
  - `item.comment.body` or `item.comment.comment` for snippet
  - author from `item.context.users[0]` (`name`, `handle`)
  - `item.comment.reactions` for likes
  - URL: `https://substack.com/@<handle>/note/<entity_key>` where `entity_key` is like `c-...`

## Failure Signals

- HTTP 401/403 from the personal feed API when the browser is not logged in → `AUTH_REQUIRED`.
- Missing `items` array or unexpected response shape → `DRIFT_DETECTED`.
- Empty `items` after pagination → `EMPTY_RESULT`.
- Unknown category slug still returns HTTP 200 with empty/irrelevant results; the command validates against the known slug list and returns `INVALID_PARAM` for unknown slugs.
- `nextCursor` absent or `items` empty before reaching the requested limit → stop and return accumulated results.

## Capture Assessment

This command should be captured. The explore phase verified stable internal APIs for both the personal feed and category feeds, a complete category slug list, and cursor-based pagination. The command fills a clear gap in the Substack command set and reuses the project's established browser runtime pattern.
