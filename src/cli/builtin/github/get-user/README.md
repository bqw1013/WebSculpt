# github/get-user

Fetch a GitHub user's or organization's public profile by username or profile URL. Reads the rendered profile page (SSR + hydration) for identity/contact/socials, and enriches exact counts from the GitHub API (single request, page-context fetch). No login required.

## Description

Given a GitHub username (e.g. `torvalds`) or a full profile URL (e.g. `https://github.com/torvalds`), return the user's/org's public profile: login, name, type (User/Organization), avatar, bio, company, blog, location, email, X/Twitter handle, all social accounts, exact public repo/gist counts, follower/following counts, and account creation date. Works for both users and organizations.

Requires Chrome or Edge running with remote debugging enabled (WebSculpt daemon attaches to it).

## Parameters

| Name | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `user` | string | yes | - | GitHub username (e.g. `torvalds`) or the full profile URL `https://github.com/torvalds`.（用户名或主页完整 URL，如 `torvalds` 或 `https://github.com/torvalds`；用户与组织均支持。） |

## Return Value

```json
{
  "login": "torvalds",
  "name": "Linus Torvalds",
  "type": "User",
  "avatar_url": "https://avatars.githubusercontent.com/u/1024025?v=4",
  "html_url": "https://github.com/torvalds",
  "bio": null,
  "company": "Linux Foundation",
  "blog": null,
  "location": "Portland, OR",
  "email": null,
  "twitter": null,
  "public_repos": 12,
  "public_gists": 1,
  "followers": 315584,
  "following": 0,
  "created_at": "2011-09-03T15:26:22Z",
  "socials": []
}
```

A richer example (`--user sindresorhus`):

```json
{
  "login": "sindresorhus",
  "name": "Sindre Sorhus",
  "type": "User",
  "bio": "Full-Time Open-Sourcerer. Focused on Swift & JavaScript. Makes macOS apps, CLI tools, npm packages.",
  "blog": "https://sindresorhus.com/apps",
  "email": "user@example.com",
  "twitter": "sindresorhus",
  "public_repos": 1141,
  "followers": 80949,
  "socials": [
    { "label": "X", "handle": "@sindresorhus", "url": "https://twitter.com/sindresorhus" },
    { "label": "Mastodon", "handle": "@sindresorhus@mastodon.social", "url": "https://mastodon.social/@sindresorhus" },
    { "label": "Bluesky", "handle": "@sindresorhus.com", "url": "https://bsky.app/profile/sindresorhus.com" },
    { "label": "Instagram", "handle": "sindresorhus", "url": "https://instagram.com/sindresorhus" }
  ]
}
```

Notes:
- `type` is `User` or `Organization`; organizations have no `company`/`twitter`, and their `bio` is the org description.
- `email` comes from the profile page (GitHub API usually returns null even when the page shows it); `twitter` is the X handle derived from the page's social accounts (or the API's `twitter_username`).
- `public_repos`/`public_gists`/`followers`/`following`/`created_at` are exact values from the GitHub API. The profile page only displays abbreviated counts (`316k`, `1.1k`), so exact values require the API. When the API is rate-limited (403/429), these fall back to page-abbreviated approximations (and `public_gists`/`created_at` become null).
- Optional fields (`bio`/`company`/`blog`/`location`/`email`/`twitter`/`socials`) are `null`/empty when the account does not expose them.

## Usage

```
websculpt github get-user --user torvalds
websculpt github get-user --user https://github.com/torvalds
websculpt github get-user --user github
```

## Common Error Codes

- `INVALID_PARAM` — `user` is missing or not a valid GitHub username / profile URL.
- `NOT_FOUND` — the user or organization does not exist (404).
- `EMPTY_RESULT` — page loaded but no profile data could be extracted.
- `NETWORK_ERROR` — load failed, or GitHub rate-limited/blocked (HTTP 429/403).
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging enabled (infrastructure; raised by the daemon).
