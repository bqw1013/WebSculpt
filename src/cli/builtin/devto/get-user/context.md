# Context

## Precipitation Background

DEV.to (Forem) provides a public API for reading user profiles, but unauthenticated requests are subject to rate limits and occasional instability. A browser fallback path makes the command resilient while still preferring the fast API path.

## Value Assessment

- Reusable for any public DEV.to user profile lookup.
- Saves manual browser inspection and API parameter memorization.
- API-first keeps the common case fast; fallback keeps it reliable.

## Page Structure

- API: `GET https://dev.to/api/users/by_username?url={username}` with `Accept: application/vnd.forem.api-v1+json`.
- Page: `https://dev.to/{username}`.
- Main container: `header.profile-header`.
- Name: first text node of `header.profile-header h1`.
- Bio: `.profile-header__bio`.
- Avatar: `.profile-header img.crayons-avatar__image`.
- User id: `JSON.parse(button.follow-user.dataset.info).id`.
- Meta items: `.profile-header__meta__item`, distinguished by `<svg><title>` (`Location`, `Joined`, `Email`, `Website`, `GitHub`, `Twitter`).
- Joined date ISO value: `<time datetime="...">` inside the `Joined` item.

## Environment Dependencies

- Browser remote debugging must be enabled (`chrome://inspect/#remote-debugging`).
- No login required for public profiles.
- The browser fallback path uses random delays and small scroll/mouse movements to keep the interaction pattern neutral.

## Failure Signals

- API 404 JSON: `{"error":"not found","status":404}`.
- API 429: triggers browser fallback.
- API 5xx / network / JSON parse failure: triggers browser fallback.
- Page 404: title contains `404` or `h1` text contains "doesn't exist".
- Missing `.profile-header` on a non-404 page: `DRIFT_DETECTED`.

## Repair Clues

- If `.profile-header` class changes, update selectors in `extractFromPage`.
- If Forem API changes path or header requirements, update `API_BASE` and `fetchUserApi` headers.
- To test the browser fallback path without waiting for API failure, temporarily block the API endpoint at the network level.
