# Context

## Precipitation Background

DEV.to organizations (e.g. platform team accounts, company accounts) publish posts under a shared identity. Callers need a quick way to look up an organization's public summary, contact links, tech stack, and member list without manually browsing to `https://dev.to/{org}`.

## Value Assessment

This command turns a repeatable browser/API lookup into a single CLI call. The public Forem API is fast and structured; the browser fallback keeps the command usable when the API is temporarily unavailable. The input is just one username, making it easy to reuse in scripts.

## Page Structure

- API primary endpoint: `GET https://dev.to/api/organizations/{org}`
- API members endpoint: `GET https://dev.to/api/organizations/{org}/users`
- Browser fallback URL: `https://dev.to/{org}`
- Stable selectors:
  - Name: `.org-header-text h1` first text node
  - Tag line: `.org-header-text p`
  - Summary block: sibling of `.org-header-main`
  - Summary: `p.fs-base.color-base-90`
  - Website: first `a[href^="https://"]` excluding Twitter/GitHub
  - Twitter: `a[href*="twitter.com"]`
  - GitHub: `a[href*="github.com"]`
  - Joined: `time[datetime]`
  - Tech stack: `.crayons-card` containing "Our stack" → `p`
  - Logo: `.org-header-logo img`
  - Posts/members counts: regex on `document.body.innerText`
  - Member preview: `.crayons-card` containing "Meet the team" → `a[href^="/"]`

## Environment Dependencies

- Requires an attached browser running with remote debugging enabled (`chrome://inspect/#remote-debugging`).
- No DEV.to login is required; all data is public.
- The command runs in a browser tab created by the WebSculpt daemon and does not touch other tabs.

## Failure Signals

- API HTTP 404 → organization does not exist.
- API HTTP 429 → rate limited; browser fallback is attempted.
- API HTTP 5xx or fetch failure → browser fallback is attempted.
- Browser page title starts with `404:` or `h1` contains "Looks like this page doesn't exist" → `NOT_FOUND`.
- `.org-header-text` missing after page load while title is not 404 → page structure may have drifted; command returns `EMPTY_RESULT`.

## Repair Clues

- If API shape changes, inspect `https://dev.to/api/organizations/{org}` response directly.
- If page selectors drift, check `.org-header-text`, `.org-header-main`, and `.crayons-card` classes on `https://dev.to/{org}`.
- Member list limit in fallback is bounded by the number of avatars rendered in the "Meet the team" widget (currently 50).
