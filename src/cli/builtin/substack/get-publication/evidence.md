# Evidence: substack/get-publication

This document records the research and validation evidence for the `substack/get-publication` command.

## Exploration Path

- Checked the existing WebSculpt command library with `websculpt command list substack`. No existing command returns the article list of a single publication homepage.
- Read the WebSculpt browser runtime guide before using browser automation.
- Attached a dedicated Playwright CLI session and created our own tab for exploration; did not touch other tabs.
- Inspected the DOM of two publication homepages and discovered a stable public API endpoint that returns the article list.

## Verified URLs

- `https://bettermarkets.substack.com/`
- `https://bettermarkets.substack.com/?sort=top`
- `https://bettermarkets.substack.com/?sort=community`
- `https://bettermarkets.substack.com/archive`
- `https://bettermarkets.substack.com/about`
- `https://nonexistentxyzabc12345.substack.com/` (404 sample)

## Structural Evidence

### API endpoint

```text
GET https://{publication}.substack.com/api/v1/homepage_data
```

Response JSON contains at least:

- `newPosts` — array of latest posts.
- `topPosts` — array of top posts.

Each post object contains:

```json
{
  "id": 209663505,
  "title": "Inside Out: What Is and Isn’t Insider Trading in Prediction Markets?",
  "subtitle": "By Amanda Fischer, Policy Director & COO",
  "post_date": "2026-08-03T18:09:30.233Z",
  "slug": "inside-out-what-is-and-isnt-insider",
  "canonical_url": "https://bettermarkets.substack.com/p/inside-out-what-is-and-isnt-insider"
}
```

### DOM sources for publication metadata

- Publication name: `script[type="application/ld+json"]` → `name`.
- Description: `meta[property="og:description"]` or `meta[name="description"]`.
- Author: parsed from `document.title` pattern `"Name | Author | Substack"`.

### UI tabs observed

- `Latest` → URL `?sort=new` → API field `newPosts`.
- `Top` → URL `?sort=top` → API field `topPosts`.
- `Discussions` → URL `?sort=community`; no stable API field found, so it is excluded from this command.

## Failure Signals

- Non-existent publication: page title becomes `Not Found` and `/api/v1/homepage_data` returns HTTP 404.
- Page structure drift: if `[data-testid="post-preview-title"]` is absent after navigation, the page layout may have changed.
- Empty result: `newPosts` or `topPosts` may be empty arrays for a publication with no posts; this is a valid empty result, not an error.
- Cloudflare block: direct `curl` to the API times out, which is why the browser runtime is required.

## Capture Assessment

This path should be captured as a browser-runtime command. The API endpoint is stable, the data shape is consistent across tested publications, and the command solves a clear reusable task: fetching a publication's article list in latest or top order.
