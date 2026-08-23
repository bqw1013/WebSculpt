# Evidence: github/get-issue

This document records the research and validation evidence for the `github/get-issue` command.

## Exploration Path

Command library check: `websculpt command domains` -> github domain; `websculpt command list github` -> existing commands `github/get-repo`, `github/get-trending`, `github/list-commits`, `github/list-contributors`, `github/list-releases`, `github/list-repos`. No existing command covers a single issue's detail, so this command is new.

Explored with `@playwright/cli` attached to the user's Chrome. The explore workspace trace passed `websculpt explore assess` (status: passed, capture eligible: yes) after the user confirmed the contract.

## Verified URLs

- `https://github.com/react/react/issues/11972` — open issue, verified via browser: title/state/author/body/labels/milestone ("19.0.0")/5 comments all extracted from hydrated DOM data-testid anchors.
- `https://github.com/react/react/issues/20090` — closed issue with a 93-item timeline: verified URL pagination (`?timeline_page=1`) loads the remaining comments (13 on page 0 + 43 on page 1, 0 overlap, 56 unique after dedup), and `closed_at` is read from the "X closed this" timeline event.
- `https://github.com/react/react/issues/37240` — open issue with one label and zero comments, verified: label extraction, empty assignees/milestone, zero-comment case.
- `https://github.com/react/react/issues/37224` — open issue, verified GraphQL `IssueViewerViewQuery` response shape (data.repository.issue: title/state/author/body/labels/milestone/timeline).
- `https://github.com/react/react/issues/99999999` — non-existent issue, verified NOT_FOUND: title `Page not found · GitHub`, no `[data-testid=issue-body-viewer]`, no `react-app.embeddedData`, URL stays at `/issues/99999999`.
- `https://github.com/facebook/react/issues/123` — verified redirect behavior: `facebook/react` canonicalizes to `react/react`, and issue number 123 is a Pull Request, so `/issues/123` redirects to `/pull/123` (PR page embeddedData differs from the issue page).

## Structural Evidence

The issue page is React-rendered. The SSR `react-app.embeddedData` on the issue page does NOT contain issue data (payload keys: `preloaded_records` [], `structured_data` null, `issue_search_type`, `preloadedSubscriptions`). The issue data is fetched by the page itself via the GraphQL persisted query `IssueViewerViewQuery` and rendered into the DOM after hydration.

GraphQL response (`data.repository.issue`) fields verified: id, number, databaseId, title, titleHTML, state, stateReason, locked, url, createdAt, updatedAt, author { login, name, avatarUrl, profileUrl }, body (full markdown), bodyHTML, bodyVersion, labels { edges[].node { id, color, name, nameHTML, description, url } }, milestone { title, url, ... } (nullable), assignedActors { nodes[] }, frontTimelineItems / backTimelineItems { pageInfo, totalCount, edges[].node }. There is NO `closedAt` field and NO separate comments-count field (timeline totalCount counts events+comments, not comments).

Hydrated DOM extraction anchors (stable `data-testid`, verified 2026-08-09):

| Field | Stable anchor |
|---|---|
| number | `location.href` match `/issues/(\d+)/` |
| title | `[data-testid=issue-title]` innerText |
| state | `[data-testid=header-state]` innerText (`Open` / `Closed`) |
| author | `[data-testid=issue-body-header-author]` textContent / href |
| body | `[data-testid=issue-body-viewer] .markdown-body` innerText (fallback: the viewer itself). NOTE: the `issue-body-viewer` container also holds the reaction bar (e.g. "👍 3"), so the markdown-body child must be used to exclude reaction UI. |
| created_at | `[data-testid=issue-body] relative-time[datetime]` |
| labels | `[data-testid=sidebar-labels-section] a` (name from `a span.textContent`; fallback: decode `label:"..."` from href) |
| milestone | `[data-testid=sidebar-milestones-section] a` (strip trailing `No due date`) |
| assignees | `[data-testid=sidebar-assignees-section] a[href^="/"]` logins; empty text `No one assigned` -> [] |
| closed_at | first `[data-testid^=timeline-row]` whose text matches `/closed this/i` -> its `relative-time[datetime]` |
| comment | `.react-issue-comment` -> author `[data-testid=avatar-link]` href, body `.markdown-body` innerText, created_at `relative-time[datetime]`, dedup id `[data-testid^=comment-viewer-outer-box]` |
| timeline next page | `[data-testid=timeline-crawler-pagination] a[rel=next]` href (e.g. `/react/react/issues/20090?timeline_page=1`) |

Comment loading mechanism (verified, differs from the initial "scroll lazy-load" assumption): the timeline does NOT lazy-load on scroll. Tested `window.scrollBy`/`window.scrollTo`/`page.mouse.wheel`/clicking the `issue-timeline-load-more-load-top` button — none triggered a new GraphQL request (monitored with `page.on('request')`); the comment count stayed at 13 on issue #20090. The only pagination is the `?timeline_page=N` URL of the `timeline-crawler-pagination` Next link. Pages are DISJOINT windows: page 0 (default) renders the oldest 15 + newest 15 timeline items, page 1 renders the middle chunk; issue #20090 page 0 = 13 comments, page 1 = 43 comments, 0 overlap, 56 unique. Dedup by comment id is mandatory. `?timeline_page=2` renders no issue body (end reached).

NOT_FOUND (issue or repo does not exist): HTTP 404 and/or `document.title` == `Page not found · GitHub` and/or no `[data-testid=issue-body-viewer]` and no `react-app.embeddedData`. A PR number redirects `/issues/{n}` -> `/pull/{n}`; this is detected from the final URL.

## Failure Signals

- 404 page (repo or issue missing): title `Page not found · GitHub`, HTTP 404. Detect before waiting for the normal issue selector.
- PR number: `/issues/{n}` redirects to `/pull/{n}`. The number belongs to a Pull Request, not an issue; the command reports NOT_FOUND with a clear message pointing to `github/get-pull`.
- 429/403 (rate limited): GitHub throttled the request; slow down and retry (raise NETWORK_ERROR).
- `[data-testid=issue-body-viewer]` never appears after a successful navigation: page structure changed (DRIFT_DETECTED).
- Page loaded but title/body extraction returns nothing: EMPTY_RESULT.
- Very long timelines (> ~30 items): page 0 shows only the oldest+newest windows; `include_comments=true` must follow `?timeline_page=N` and dedup by comment id to return the full thread. `comments_count` on `include_comments=false` reflects only the initially-visible comments for such extreme issues (documented in the contract).
- `closed_at` for a closed issue with a very long timeline may not be on page 0; `include_comments=true` pagination picks it up from later pages.
- Rate awareness: GitHub is rate-limit sensitive; random waits (200-700ms) before/between operations, gentle random scroll + mouse move, no bursts. No 429/403/CAPTCHA observed during exploration.

## Capture Assessment

Captured as `github/get-issue`. The path is verified and reproducible: navigate to the rendered issue page, read the hydrated DOM via stable `data-testid` anchors (SSR embeddedData has no issue data), and for `include_comments=true` follow the `?timeline_page=N` URL pagination, deduping comments by id. Browser runtime is required because the page is React-rendered and the data is only present after hydration. No GitHub REST API used, so no API quota limits.
