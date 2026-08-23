# Evidence: github/get-user

This document records the research and validation evidence for the `github/get-user` command.

## Exploration Path

Command library check: `websculpt command list github` -> get-trending / get-repo / get-issue / get-pull / list-repos / list-issues / list-pulls / list-releases / list-commits / list-contributors already exist. **No `github/get-user`** exists; `list-repos` lists a user's repos but does not return profile metadata. This command is new.

Explored with curl and `@playwright/cli` attached to the user's Chrome. The explore workspace trace passed `websculpt explore assess` (status: passed, capture eligible: yes). The capture contract was confirmed by the user on 2026-08-09.

## Verified URLs

- `https://github.com/torvalds` — real user, SSR + hydration verified. login/name/company(worksFor)/location(homeLocation)/avatar; no bio; followers shown abbreviated as `316k`.
- `https://github.com/octocat` — real user whose email is public on the page: `li.vcard-detail[itemprop="email"]` -> `mailto:octocat@github.com`. Confirmed REST `email` is null while DOM email is visible (DOM is the email source).
- `https://github.com/sindresorhus` — real user with full profile: bio (`data-bio-text`), email, blog (`li[itemprop="url"]`, `rel="nofollow me"`), and 4 social accounts (`li.vcard-detail[itemprop="social"]` with `svg title` platform label + `a[rel="nofollow me"]` href). Repositories tab badge `Repositories1.1k (1.1k)` is abbreviated.
- `https://github.com/github` — real organization: `header.pagehead.orghead`, h1 name, description in `.color-fg-muted div`, `[itemprop="location"]`, `[itemprop="url"]` blog, followers `82.1k`. No `.p-nickname.vcard-username`.
- `https://github.com/this-user-does-not-exist-xyz-2026` — non-existent user: title `Page not found · GitHub`, `.blankslate-heading` "Uh oh!". NOT_FOUND basis.
- `https://api.github.com/users/{login}` — REST enrichment endpoint, CORS allowed (Access-Control-Allow-Origin: *), reachable from the page context via `fetch`. Returns exact `type/public_repos/public_gists/followers/following/created_at` plus canonical text fields. Anonymous rate limit 60/hr (observed `x-ratelimit-remaining: 59`). 404 for non-existent users.

## Structural Evidence

Profile pages are SSR skeleton + React hydration (no `react-app.embeddedData` user JSON on the page; only header/nav partials).

**User page DOM (hydrated):**
- login: `.p-nickname.vcard-username` (SSR)
- name: `.p-name.vcard-fullname` (SSR)
- avatar: `img.avatar-user` / `.vcard-avatar img` `src` (SSR)
- bio: `.p-note.user-profile-bio` — text in `data-bio-text` attribute (present in SSR even when `hidden`); `hidden=false` when the user has a bio.
- company: `li.vcard-detail[itemprop="worksFor"]` text (e.g. `Linux Foundation`)
- location: `li.vcard-detail[itemprop="homeLocation"]` text
- email: `li.vcard-detail[itemprop="email"]` anchor `mailto:...`
- blog: `li.vcard-detail[itemprop="url"]` anchor href (rel="nofollow me")
- socials: `li.vcard-detail[itemprop="social"]` — `svg title` = platform label (X/Mastodon/Bluesky/Instagram), `a[rel="nofollow me"]` text = handle, href = profile URL
- followers/following: anchor whose text ends with `followers` / `following` (e.g. `316k followers`, `0 following`) — **abbreviated, not exact**
- Repositories tab badge: anchor whose text contains `Repositories`, e.g. `Repositories12 (12)` (exact when <1000) or `Repositories1.1k (1.1k)` (abbreviated)

**Organization page DOM:**
- `header.pagehead.orghead` present (type=Organization detector); no `.p-nickname.vcard-username`
- name: `header.pagehead h1` (e.g. `GitHub`)
- avatar: `header.pagehead img.avatar` `src`
- description (used as bio): `.js-profile-editable-replace .color-fg-muted div`
- location: `[itemprop="location"]`; blog: `[itemprop="url"]` href
- followers: `a[href*="followers"]` (e.g. `82.1k followers`)
- Repositories tab badge: `Repositories557 (557)` (exact)

**REST API `https://api.github.com/users/{login}` (page-context fetch):**
- 200 -> `{ login, name, type:"User"|"Organization", avatar_url, html_url, bio, company, blog, location, email (usually null), twitter_username, public_repos, public_gists, followers, following, created_at }`
- 404 -> `{ "message": "Not Found" }` (NOT_FOUND)
- 403/429 -> rate limited (fall back to DOM abbreviated values)

**Merge rule (verified):** exact counts (`public_repos` large, `public_gists`, `followers`, `following`, `created_at`) are NOT in the page DOM — REST is the only exact source. DOM email is authoritative (REST email is usually null even when the page shows it). Twitter/X handle comes from the DOM `social` item whose host is twitter.com/x.com, else REST `twitter_username`.

## Failure Signals

- 404: title `Page not found · GitHub` and/or HTTP 404 and/or REST 404. Detect BEFORE waiting for normal selectors.
- 429/403: GitHub rate-limited/blocked -> `NETWORK_ERROR`; slow down and retry. REST 403/429 (rate limited) -> gracefully fall back to DOM abbreviated counts (do not fail).
- Structure drift: `.p-nickname.vcard-username` / `header.pagehead.orghead` missing -> `EMPTY_RESULT` or `DRIFT_DETECTED`.
- Optional fields (bio/company/blog/location/email/socials) can be null/empty — do not treat as failure.
- Page DOM shows abbreviated counts (`316k`, `1.1k`) — never parse these as exact numbers for large values; exact counts require REST.
- Rate awareness: GitHub is rate-limit sensitive; random waits between operations, gentle random scroll + mouse move, no bursts. No 429/403/CAPTCHA observed during exploration.

## Capture Assessment

Captured as `github/get-user`. The path is verified and reproducible: navigate to the profile page (SSR + hydration) for identity/contact/socials + REST API enrichment (from the page context, CORS allowed, single request) for exact public_repos/public_gists/followers/following/created_at. Browser runtime is required because the page is React-rendered (bio/socials hydrate) and the exact counts require a browser-context fetch that reuses the user's network environment. Unlike the sibling get-repo, get-user uses the REST API as a single-request enrichment (documented and user-confirmed) because the profile page does not expose exact counts; falls back to DOM values when rate-limited.
