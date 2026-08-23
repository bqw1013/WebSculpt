# Context

## Precipitation Background (Why This Command Exists)

Substack profiles contain useful metadata (bio, publications, subscriber count) and public activity sections, but the WebSculpt library had no focused command to fetch a single user by handle. `substack/search` can surface people but is not designed to return a full profile object or the profile-page sections.

## Value Assessment

This command is reusable for any workflow that needs to look up a Substack author: content research, competitor analysis, lead enrichment, or chaining with `substack/get-publication`. It saves the caller from manually navigating profile pages and parsing Substack's UI.

## Page Structure

- Profile metadata source: `GET https://substack.com/api/v1/profile/search?query=<handle>&page=0`
  - Fuzzy search; the command filters for an exact `handle` match.
  - Contains `id`, `name`, `handle`, `bio`, `photo_url`, `subscriberCountString`, `subscriberCountNumber`, `followerCount`, `primaryPublication`, `publicationUsers`, `subscriptions`, `userLinks`, `status`.
- Activity / Posts / Likes & Replies source: `GET https://substack.com/api/v1/reader/feed/profile/<user_id>`
  - Returns `{ items, nextCursor }`.
  - Items have `type: 'post' | 'comment'` and `context.type: 'post' | 'note' | 'comment_restack'`.
  - Server-side filtering is not supported; the command filters client-side.
  - Pagination uses `?cursor=<nextCursor>`.
- Subscriptions source: `subscriptions` array inside the profile search response.

## Environment Dependencies

- Browser automation required (`runtime: browser`).
- No login required; all data is public.
- The command navigates to `https://substack.com/explore` first to ensure the API requests originate from the correct domain.

## Failure Signals

- `searchData.results` is empty or contains no exact `handle` match → `NOT_FOUND`.
- Profile page redirect to `/search/<handle>?searching=profile` (DOM fallback) → `NOT_FOUND`.
- Missing `items` or `nextCursor` shape in feed response → `DRIFT_DETECTED`.
- Any `fetch` returns a non-2xx status → `API_ERROR`.

## Repair Clues

- If `/api/v1/profile/search` drifts, inspect the response shape and update `normalizeProfile`.
- If `/api/v1/reader/feed/profile/<id>` drifts, inspect item `type` / `context.type` values and update filtering logic.
- As a last resort, the DOM fallback on `https://substack.com/@<handle>` can extract JSON-LD `Person` metadata.
