# Evidence: devto/get-user

## Exploration Path

- Command library check: no existing `devto` commands.
- Browser automation guide read: `websculpt-explore/references/access/playwright-cli-guide.md`.
- Runtime contract read: `websculpt-capture/references/browser-contract.md`.
- The command was first validated in explore workspace `devto-get-user` and passed `websculpt explore assess`.

## Verified URLs

- `https://dev.to/api/users/by_username?url={username}` — Forem API user endpoint.
- `https://dev.to/{username}` — Public user profile page.
- `https://dev.to/{username}` — Verified 404 page shape using a non-existent username.

## Structural Evidence

### API path

- Method: `GET`
- Endpoint: `https://dev.to/api/users/by_username?url={username}`
- Required header: `Accept: application/vnd.forem.api-v1+json`
- Success response fields (v1): `type_of`, `id`, `username`, `name`, `twitter_username`, `github_username`, `email`, `summary`, `location`, `website_url`, `joined_at`, `profile_image`, `badge_ids`
- `joined_at` from API is a locale-style date string such as `Dec 27, 2015`; the command normalizes it to ISO-8601 UTC.

### Browser fallback path

- Target page: `https://dev.to/{username}`
- Primary container: `header.profile-header`
- Name: `header.profile-header h1`
- Bio/summary: `.profile-header__bio`
- Avatar: `.profile-header img.crayons-avatar__image`
- Numeric user id: parsed from the `data-info` attribute of `button.follow-user` inside the header.
- Meta items: each `.profile-header__meta__item`; the `<svg><title>` distinguishes `Location`, `Joined`, `Email`, `Website`, `GitHub`, `Twitter`.
- `joined_at` is taken from the `<time datetime="...">` element inside the `Joined` meta item, already in ISO-8601 UTC.

## Failure Signals

- API returns HTTP 404 with body `{"error":"not found","status":404}` → `NOT_FOUND`.
- API returns HTTP 429 → trigger browser fallback; if browser fallback also fails, raise `RATE_LIMITED`.
- API returns 5xx or network/JSON failure → trigger browser fallback; if browser fallback also fails, raise `NETWORK_ERROR`.
- Browser page title contains `404` and `.profile-header` is missing → `NOT_FOUND`.
- `.profile-header` missing on a non-404 page → `DRIFT_DETECTED`.
- Missing or invalid `username` parameter → `INVALID_PARAM`.

## Capture Assessment

This path should be captured. The API-first strategy provides fast, structured responses for the common case, while the browser fallback provides resilience when the API is unavailable. Both paths were validated against real profile pages and the official Forem API documentation.
