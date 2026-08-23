# Context

## Precipitation Background (Why This Command Exists)

`quora/search` can discover users but cannot fetch a single user's full profile or content sections. Users needed a way to get profile metadata (credential, bio, counts) and to list answers, questions, posts, followers, followed Spaces, and public activity logs for a given Quora user.

## Value Assessment

- High reuse value: every user discovered through search or answers can be explored further.
- Saves manual browser navigation and extraction.
- Provides structured metadata that can be chained into `quora/get-answer` and `quora/get-space`.

## Page Structure

- Base URL: `https://www.quora.com/profile/<name>`
- Sections map to sub-paths:
  - `answers` → `/profile/<name>/answers`
  - `questions` → `/profile/<name>/questions`
  - `posts` → `/profile/<name>/posts`
  - `followers` → `/profile/<name>/followers`
  - `following` → `/profile/<name>/following` (lists Spaces, not users)
  - `log` → `/profile/<name>/log` (UI title: "Edits")
- Header metadata is extracted from `document.body.innerText` using regex for followers/following counts, tab counts, credential, bio, and sidebar info.
- `window.ansFrontendGlobals.data.inlineQueryResults` is mostly empty on profile pages; DOM extraction is the primary path.

## Environment Dependencies

- Requires Chrome or Edge with remote debugging enabled.
- Recommended: a logged-in Quora session. Anonymous sessions may encounter login walls or Cloudflare challenges.
- The command uses randomized waits (1–3s), mouse movement, and scrolling to keep polite pacing.

## Failure Signals

- `Page Not Found` in body text → `NOT_FOUND`.
- `Something went wrong` generic error page → `DRIFT_DETECTED`.
- List section returns zero items without an explicit empty-state signal → `DRIFT_DETECTED`.
- Expected elements (answer links, question links, profile links, Space links, log action text) do not appear within the wait timeout → `DRIFT_DETECTED`.

## Repair Clues

- If header metadata extraction fails, check whether Quora changed the order of name/credential/followers text in `document.body.innerText`.
- If a list section returns `DRIFT_DETECTED`, try increasing wait time or adjusting the representative element selector in `waitForSectionContent`.
- If posts are empty, ensure sufficient scrolling is performed; `/posts` lazy-loads the main feed.
- If `/following` behavior changes back to listing users, update the extraction branch to emit user objects instead of Space objects.
