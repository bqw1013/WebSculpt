# substack/get-post

Get the full details of a single Substack post by URL.

## Description

Given a Substack post URL, this command navigates to the post in a browser and retrieves its metadata and full body text. It uses Substack's internal `/api/v1/posts/<slug>` endpoint as the primary data source, and falls back to visible DOM selectors if the API response drifts or is unavailable.

Comments and related posts are **not** returned by default. Use `--include_comments true` to also fetch the comment list.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--url`   | Yes      | —       | The full URL of the Substack post, e.g. `https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree` |
| `--include_comments` | No | `false` | Set to `true` to also return the post's comments |

## Return Value

```typescript
{
  title: string;                  // Post title
  subtitle: string | null;        // Post subtitle
  author: string | null;          // Author display name
  author_handle: string | null;   // Author handle, e.g. "bettermarkets"
  publication: string | null;     // Publication name
  publication_domain: string;     // Publication domain, e.g. "bettermarkets.substack.com"
  url: string;                    // The URL that was requested
  canonical_url: string;          // The canonical URL returned by Substack
  post_date: string | null;       // ISO 8601 publish timestamp
  body_text: string;              // Plain text body
  like_count: number | null;      // Number of likes/reactions
  comment_count: number | null;   // Number of comments
  restack_count: number | null;   // Number of restacks
  comments?: Array<{              // Only present when --include_comments=true
    author: string | null;
    body: string;
    published_at: string | null;
    like_count: number;
  }>
}
```

## Usage

```bash
# Default: post details only
websculpt substack get-post --url https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree

# Include comments
websculpt substack get-post --url https://bettermarkets.substack.com/p/jamie-dimon-and-better-markets-agree --include_comments true
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | `--url` was not provided. |
| `INVALID_URL` | The provided URL is not a valid HTTP/HTTPS URL or does not contain a post slug. |
| `NOT_FOUND` | The post does not exist (API returned 404 or missing title). |
| `EMPTY_BODY` | The post body is not accessible, usually because it requires a subscription. |
| `DRIFT_DETECTED` | Both the API and the DOM fallback failed to extract the post. |
| `BROWSER_ATTACH_REQUIRED` | Chrome remote debugging is not available. The command will not start its own browser. |

## Notes

- Substack uses Cloudflare protection, so a browser runtime is required.
- The command does not start its own browser daemon. If you see `BROWSER_ATTACH_REQUIRED`, enable remote debugging in Chrome at `chrome://inspect/#remote-debugging` and keep the browser open.
- Access to paid-only posts without an active subscription may result in `EMPTY_BODY`.
- Related posts are not returned by default; use `substack/get-publication` or `substack/search` to discover other posts from the same publication.
