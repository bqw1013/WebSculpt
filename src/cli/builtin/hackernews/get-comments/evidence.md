# Evidence: hackernews/get-comments

This document records the research and validation evidence for the `hackernews/get-comments` command.

## Exploration Path

The command library was checked with `websculpt command list hackernews`; existing Hacker News commands are `get-new`, `get-past`, `get-top`, and `search`, with no comments command. A prior explore workspace was created for this path; the exploration and capture skill guides and the browser runtime contract document were read in full before implementation. The verified browser session was `<session>`, attached to Chrome; the capture daemon will attach independently at command runtime.

## Verified URLs

- https://news.ycombinator.com/newcomments
- https://news.ycombinator.com/newcomments?next=49095652
- https://hacker-news.firebaseio.com/v0/item/49095715.json (API comparison only)
- https://hn.algolia.com/api/v1/search_by_date?tags=comment&hitsPerPage=10&page=0 (API comparison only)

## Structural Evidence

The selected source is the server-rendered HN `newcomments` page. Each page contains 30 comment rows as `tr.athing` with a numeric `id`; rows are ordered newest-first. For each row, the verified selectors and meanings are:

- `.hnuser` -> author name, nullable for deleted users.
- `.age[title]` -> `YYYY-MM-DDTHH:mm:ss <unix-seconds>`; `.age a` -> comment item URL.
- A link whose text is `parent` -> direct parent item URL; for top-level comments it equals the story URL.
- A link whose text is `context` -> context URL with `#<commentId>`.
- `.onstory a` -> story HN URL and visible story title.
- `.commtext` -> comment body; `innerText` is readable text and `innerHTML` preserves paragraph/link markup.

The `More` link is an ID cursor (`newcomments?next=<last-id>`), not a page number. The first page had 30 rows and More `?next=49095652`; that page had IDs `49095652` through `49095617` and More `?next=49095616`. Extraction follows this link until the requested limit is filled or More is absent. Relative links are normalized against `https://news.ycombinator.com/`, and `rank` is assigned continuously across pages.

Algolia `search_by_date?tags=comment` exposes richer fields but was rejected as the source because it lagged the live page (the HN page had newer IDs `49095715`, `49095712`, `49095711`, and `49095709` while Algolia began at `49095708`). Firebase item JSON exposes only `by`, `id`, `parent`, `text`, `time`, and `type`, so it cannot reproduce story/context fields without extra traversal.

## Failure Signals

The command requires an attached Chrome/browser runtime but no HN login or API key. Runner-level `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, and `COMMAND_TIMEOUT` are surfaced by the runtime. Command-level failures use `INVALID_PARAM` for a non-integer or out-of-range limit, `DRIFT_DETECTED` when the expected comments rows or required selectors are absent, `NETWORK_ERROR` for navigation failures, and `EMPTY_RESULT` only if a valid page has no comment rows and no More link. A missing/changed `More` link stops pagination only after the current page has been parsed; duplicate cursors or repeated comment IDs are treated as `DRIFT_DETECTED` to avoid loops or duplicate output. The implementation is read-only and intentionally does not click vote/login links.

## Capture Assessment

Capture is appropriate: the HN page path was executed in an attached browser, its DOM structure and cursor pagination were observed with real samples, and API alternatives were compared and rejected for semantic drift. The command is a new `hackernews/get-comments` read-only action with a bounded `limit` and a stable, structured output contract.
