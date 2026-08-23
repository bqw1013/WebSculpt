# kickstarter/get-creator

Fetch a Kickstarter creator's public profile and their launched projects list. Runs in the browser (Cloudflare blocks direct HTTP clients; the SSR-rendered `data-projects` payload is only served to a real browser session).

## Description

Given a creator profile name (slug) or a full `/profile/{slug}` URL, returns:
- Creator profile: name, bio, website, location, join date, backed-project count, created-project count.
- Created projects list: each with id, name, slug, url, state (successful/submitted/started/live/failed/canceled), percent funded, pledged/goal amounts, currency, backer count, deadline and launch timestamps.

Data comes from Kickstarter's server-rendered pages: `/profile/{slug}/about` (header + bio + website) and `/profile/{slug}/created` (projects in the `DIV[data-projects]` JSON attribute). Projects paginate 32 per page via `?page=N`.

## Parameters

- `creator` (string, required): Creator profile slug or full profile URL.
  - `baroque`
  - `https://www.kickstarter.com/profile/baroque`
- `max_pages` (integer, optional, default 6): Max pages of created projects to fetch (32 projects per page, i.e. up to 192). Stops early once all projects are collected (total is read from the profile's "Created N" tab) or a page returns empty.

## Return Value

```json
{
  "source": "kickstarter",
  "name": "Baroque Publishing",
  "profile_slug": "baroque",
  "profile_url": "https://www.kickstarter.com/profile/baroque",
  "bio": "Crafting premium, one-of-a-kind tarot decks and TTRPG experiences...",
  "website": "https://baroquetarot.com",
  "location": "Sheridan, WY",
  "joined_at": "2023-09-08T18:09:36-04:00",
  "backed_count": 288,
  "created_count": 13,
  "created_projects": [
    {
      "id": 969156727,
      "name": "Wit & Wisdom: The Jane Austen Tarot",
      "slug": "jane-austen-tarot",
      "url": "https://www.kickstarter.com/projects/baroque/jane-austen-tarot",
      "state": "successful",
      "percent_funded": 1062.74,
      "pledged": 53137,
      "goal": 5000,
      "currency": "USD",
      "backers_count": 683,
      "deadline": 1787072557,
      "launched_at": 1785258157,
      "is_launched": true
    }
  ],
  "truncated": false,
  "error": null
}
```

- `state` values are Kickstarter native: `successful`, `submitted`, `started`, `live`, `failed`, `canceled`. Pre-launch/upcoming projects (state `started`/`submitted`) have `percent_funded: 0` and `deadline: 0` — this is expected, not missing data.
- `truncated`: `true` when `max_pages` was reached before all projects were collected.
- `error`: `null` on success; otherwise an object with a `code`.

## Usage

```
websculpt kickstarter get-creator --creator baroque
websculpt kickstarter get-creator --creator https://www.kickstarter.com/profile/sjgames --max_pages 3
```

## Common Error Codes

- `MISSING_PARAM`: required `creator` parameter is missing or empty.
- `INVALID_PARAM`: `creator` is not a valid slug/URL, or `max_pages` is not an integer between 1 and 20.
- `NOT_FOUND`: no such creator (profile 404 page). Checked before platform-block detection.
- `PLATFORM_BLOCKED`: Cloudflare / platform blocking verification or HTTP 403/429 during navigation.
- `DRIFT_DETECTED`: reserved for page-structure drift (currently not thrown).
