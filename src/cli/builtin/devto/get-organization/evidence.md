# Evidence: devto/get-organization

This document records the research and validation evidence for the `devto/get-organization` command.

## Exploration Path

- Checked the command library with `websculpt command domains` and `websculpt command list`; no existing `devto` domain or `devto/get-organization` command was found.
- Read `references/access/playwright-cli-guide.md` before any browser automation during the explore phase.
- Verified the public Forem API endpoints with `curl` and the browser page extraction path with Playwright CLI attached to a local browser session.

## Verified URLs

- `https://dev.to/api/organizations/{org}` — public Forem API endpoint for an organization profile.
- `https://dev.to/api/organizations/{org}/users` — public Forem API endpoint for the organization's member list.
- `https://dev.to/{org}` — browser profile page for an organization.
- `https://dev.to/{org}` — browser 404 page used to confirm the not-found signal (verified with a non-existent organization name).

## Structural Evidence

### API response shape

A successful call to `GET https://dev.to/api/organizations/{org}` returns:

```json
{
  "type_of": "organization",
  "id": 1,
  "username": "string",
  "name": "string",
  "summary": "string",
  "twitter_username": "string | null",
  "github_username": "string | null",
  "url": "string",
  "location": "string | null",
  "tech_stack": "string | null",
  "tag_line": "string | null",
  "story": "string | null",
  "joined_at": "ISO-8601 string",
  "profile_image": "URL string"
}
```

A successful call to `GET https://dev.to/api/organizations/{org}/users` returns an array of user objects with fields `id`, `type_of`, `username`, `name`, `summary`, `location`, `website_url`, `joined_at`, and `profile_image`.

A missing organization returns HTTP 404 with body `{"error":"not found","status":404}`.

### Browser page selectors

On `https://dev.to/{org}` the following DOM structure is stable:

- Organization name: `.org-header-text h1` first text node.
- Tag line: `.org-header-text p`.
- Details block: the sibling element immediately after `.org-header-main`.
- Summary paragraph: `p.fs-base.color-base-90` inside the details block.
- Website link: first `a[href^="https://"]` in the details block that does not point to Twitter or GitHub.
- Twitter link: `a[href*="twitter.com"]` inside the details block.
- GitHub link: `a[href*="github.com"]` inside the details block.
- Joined date: `time[datetime]` inside the details block.
- Tech stack: `.crayons-card` containing heading text "Our stack" → `p`.
- Posts/members counts: regex against `document.body.innerText` for `(\d[\d,]*) posts published` and `(\d[\d,]*) members`.
- Member preview: `.crayons-card` containing heading text "Meet the team" → `a[href^="/"]`; username from the path segment, profile image from `img.src`.
- Logo image: `.org-header-logo img`.

## Failure Signals

- API returns HTTP 429 or 5xx → trigger browser fallback.
- API fetch throws (network failure) → trigger browser fallback.
- Browser page title starts with `404:` or `h1` contains "Looks like this page doesn't exist" → return `NOT_FOUND`.
- Missing required parameter `org` → return `INVALID_PARAM`.
- API returns HTTP 200 with empty body or unexpected JSON → return `EMPTY_RESULT`.
- If the browser cannot attach, the runner raises `BROWSER_ATTACH_REQUIRED`.
- Structural drift (e.g., `.org-header-text` missing when the page is not a 404) → return `DRIFT_DETECTED`.

## Capture Assessment

This command should be captured. The public Forem API provides fast, structured organization profiles, and the browser page provides a reliable fallback when the API is temporarily unavailable. The required parameters are minimal, the output shape is consistent, and both success and failure paths have been verified with real data.
