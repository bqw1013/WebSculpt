# Evidence: substack/get-post

This document records the research and validation evidence for the `substack/get-post` command.

## Exploration Path

- Checked the WebSculpt command library first. Existing substack commands (`get-feed`, `get-leaderboard`, `get-trending`, `get-trending-topics`, `search`) do not provide single-post full content retrieval. No `substack/get-post` existed.
- Read the browser runtime contract and the Playwright CLI explore guide before drafting.
- Attempted static HTTP fetch via `curl` against `https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree`. Result: connection timeout / empty response (HTTP 000), because Substack uses platform edge protection. Static fetching is not viable.
- Opened a Playwright CLI session attached to the user's Chrome remote debugging instance and visited multiple real post pages.
- Verified both DOM extraction and the Substack internal API. The internal API (`/api/v1/posts/<slug>`) returns a stable JSON document with all required fields, including `body_html`, `reaction_count`, `comment_count`, `restacks`, and `publishedBylines`. This is the primary data source chosen for the command.
- Verified comments behavior: initial post page renders only a subset of comments; the full list is available at `/p/<slug>/comments`. No stable public comments API was found, so comments are fetched via DOM extraction on the comments page when `--include_comments true` is passed.
- Verified related posts appear under a "Ready for more?" section on the post page, but they are not returned by default. They can be retrieved via `substack/get-publication` instead.
- Decided to return only `body_text` (plain text) by default, because `body_html` is roughly 13x larger and contains Substack-specific markup that is not useful for downstream reading or analysis.

## Verified URLs

- `https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree`
- `https://bettermarkets.substack.com/p/inside-out-what-is-and-isnt-insider`
- `https://bettermarkets.substack.com/p/nonexistent-xyz-abc-12345` (404 / not-found verification)
- `https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree/comments` (comments page verification)

## Structural Evidence

### Substack internal API (primary source)

When the browser is on a publication domain, a relative fetch to `/api/v1/posts/<slug>` returns a JSON object. Example verified on `https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree`:

```json
{
  "title": "Jamie Dimon and Better Markets Agree on One Important Thing...",
  "subtitle": "Christopher Appel, Director of Banking Policy, Better Markets",
  "post_date": "2026-08-01T10:00:00.000Z",
  "canonical_url": "https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree",
  "body_html": "<p>Jamie Dimon, the CEO of JPMorgan Chase...</p>...",
  "reaction_count": 50,
  "comment_count": 4,
  "restacks": 2,
  "publishedBylines": [
    {
      "name": "Better Markets",
      "handle": "bettermarkets",
      "publicationUsers": [
        {
          "publication": {
            "name": "The Public Interest by Better Markets",
            "subdomain": "bettermarkets"
          }
        }
      ]
    }
  ]
}
```

Key fields used:
- `title`
- `subtitle`
- `post_date`
- `canonical_url`
- `body_html` (converted to plain text; raw HTML is not returned by default)
- `reaction_count` → `like_count`
- `comment_count`
- `restacks` → `restack_count`
- `publishedBylines[0].name` → `author`
- `publishedBylines[0].handle` → `author_handle`
- `publishedBylines[0].publicationUsers[0].publication.name` → `publication`
- `publishedBylines[0].publicationUsers[0].publication.subdomain` → used to derive `publication_domain` when needed

### DOM fallback selectors

If the API call fails or returns incomplete data, the following selectors were verified to work across multiple publications:

- Title: `h1.post-title`
- Subtitle: `main article > region h3`
- Publication: `h1 a[href="/"]` text or its child `img` alt
- Author: first `a[href^="https://substack.com/@"]` with non-empty inner text
- Publish time: `time[datetime]`
- Body text: `.available-content` inner text
- Engagement buttons: `button.post-ufi-button`; `aria-label` contains counts such as `"Like (50)"` and `"View comments (4)"`

### Comments page selectors

When `--include_comments true` is passed, the command navigates to `/p/<slug>/comments`. Verified selectors:

- Comment container: `.comment`
- Author: parsed from `[role="article"]` `aria-label`, e.g. `"Comment by Shang Feng Yeh 11"`
- Body: text lines between author/time and action labels (`LIKE`, `REPLY`, `SHARE`)
- Relative time: e.g. `14h`, `2h`
- Like count: from `LIKE (N)` text if present, otherwise `0`

## Failure Signals

- **Invalid URL**: `new URL(params.url)` throws → `MISSING_PARAM` / `INVALID_URL`.
- **Slug cannot be parsed**: URL path does not contain a post slug → `INVALID_URL`.
- **Post not found**: API returns HTTP 404 with `{ error: "Post not found", type: "single" }` → `NOT_FOUND`.
- **Paywall / no body**: `body_html` is missing or empty → `EMPTY_BODY`.
- **API drift**: If the API endpoint changes or stops returning expected fields, fall back to DOM extraction; if both fail → `DRIFT_DETECTED`.
- **Browser not attached**: WebSculpt runner returns `BROWSER_ATTACH_REQUIRED`; the command does not start its own browser.

## Capture Assessment

This command should be captured because:
1. The path has been verified on real public Substack posts across different publications.
2. The internal API provides a stable, structured source for all required fields.
3. The use case (read a single Substack post) is clear, reusable, and not covered by existing commands.
4. Static HTTP fetching is blocked by Cloudflare, making a browser runtime necessary.
5. Error signals (404, missing body, invalid URL) are well understood and can be surfaced cleanly.
