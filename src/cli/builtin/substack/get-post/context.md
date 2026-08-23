# Context

## Precipitation Background (Why This Command Exists)

Substack is a popular long-form publishing platform. Users often want to read or analyze a specific post by URL. The existing WebSculpt substack commands cover feeds, leaderboards, trending topics, and search, but none return the full content of a single post. This command fills that gap.

## Value Assessment

- **Reusability**: High. Reading a single post is one of the most common Substack tasks.
- **Generality**: Works for any public Substack post URL using the standard `/p/<slug>` path shape.
- **Time saved**: Avoids manual browser navigation and copy-paste; returns structured data for downstream use.

## Page Structure

### Primary source: internal API

When the browser is on a publication domain, the endpoint `/api/v1/posts/<slug>` returns a JSON object with all required fields.

Example verified request:

```js
const res = await fetch("/api/v1/posts/03c");
const data = await res.json();
```

Key fields:
- `title`, `subtitle`, `post_date`, `canonical_url`
- `body_html` → converted to plain text in the browser; raw HTML is not returned by default
- `reaction_count` → `like_count`
- `comment_count`
- `restacks` → `restack_count`
- `publishedBylines[0].name` / `.handle`
- `publishedBylines[0].publicationUsers[0].publication.name` / `.subdomain`

### Fallback source: DOM

If the API fails, the command extracts from the rendered page:

- `h1.post-title` → title
- `main article > region h3` → subtitle
- `h1 a[href="/"]` (text or child `img` alt) → publication
- first `a[href^="https://substack.com/@"]` with non-empty text → author
- `time[datetime]` → publish date
- `.available-content` → body text
- `button.post-ufi-button` with `aria-label` → like/comment counts

### Optional comments source

When `--include_comments true` is passed:

- Navigate to `/p/<slug>/comments`
- Extract each `.comment` element
- Parse author from `[role="article"]` `aria-label`
- Parse body from text lines between metadata and action labels
- Parse relative time and like count

## Environment Dependencies

- Chrome remote debugging must be enabled (`chrome://inspect/#remote-debugging`).
- The WebSculpt browser daemon attaches to the user's existing Chrome instance.
- No login is required for public posts.
- Paid posts may require an active subscription; the command returns `EMPTY_BODY` if the body is not accessible.

## Failure Signals

- API returns 404 with `{ error: "Post not found", type: "single" }` → `NOT_FOUND`.
- API response lacks `title` or contains `error` → `NOT_FOUND`.
- `body_html` is missing or empty → `EMPTY_BODY` (likely paywall).
- Both API and DOM fallback fail to return a title and body → `DRIFT_DETECTED`.
- `BROWSER_ATTACH_REQUIRED` from the runner → user needs to enable remote debugging; the command does not launch a browser.

## Design Decisions

- **Comments are opt-in**: Default output does not include comments because they require an extra page navigation and DOM parse. Use `--include_comments true` when needed.
- **Related posts are not returned**: They are available via `substack/get-publication` and keeping this command focused on a single post improves clarity and stability.
- **Only `body_text` is returned**: Raw `body_html` is roughly 13x larger and contains Substack-specific markup. Plain text is preferred for reading, analysis, and downstream RAG use cases.

## Repair Clues

- If the API endpoint changes, check whether Substack has moved to a different path such as `/api/v1/post/` or a graphql endpoint.
- If `body_html` disappears from the API response but the page still renders, strengthen the DOM fallback branch.
- For custom domains, the relative API call uses the current origin. If Substack stops serving the API on custom domains, derive the `.substack.com` subdomain from the page's canonical URL or byline data.
- If comment extraction breaks, verify the `.comment` container and `[role="article"]` `aria-label` format on the `/comments` page.
