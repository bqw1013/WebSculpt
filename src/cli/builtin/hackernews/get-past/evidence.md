# Evidence: hackernews/get-past

This document records the research and validation evidence for the `hackernews/get-past` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

The command library was checked with `websculpt command domains`, `websculpt command list hackernews`, `websculpt hackernews get-new --help`, and `websculpt command show hackernews get-new --include-readme`. Existing `get-new`, `get-top`, and `search` do not provide a dated past front-page snapshot. A prior explore workspace passed `websculpt explore assess` with `capture eligible: yes`. The browser runtime contract document was read in full before drafting this command. The user approved browser runtime after Node fetch to the HN page domain consistently timed out, and a real browser attach then succeeded.

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

- https://news.ycombinator.com/front
- https://news.ycombinator.com/front?day=2026-07-28
- https://news.ycombinator.com/front?day=2026-07-28&p=2
- https://hacker-news.firebaseio.com/v0/item/49080664.json
- https://hacker-news.firebaseio.com/v0/item/49083314.json
- https://hacker-news.firebaseio.com/v0/item/49086788.json
- https://raw.githubusercontent.com/HackerNews/API/master/README.md

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

The HN page is static HTML. `/front` uses HN's latest complete-day view; `/front?day=YYYY-MM-DD` selects a date; subsequent pages use `p=2`, `p=3`, and so on. Real browser evaluation observed 30 `tr.athing` rows, with the first IDs `49080664`, `49083314`, and `49086788`, and More link `front?day=2026-07-28&p=2`; page 2 had 30 rows, first ID `49081555`, last ID `49040650`, and More link `front?day=2026-07-28&p=3`. Story rows are `<tr class="athing submission" id="<storyId>">` in historical rank order. The first row's sibling `.subline` exposed `.score` (`788 points`), `.hnuser` (`krembo`), `.age[title]` (`2026-07-28T07:44:24 1785224664`), and `215 comments`. The page title is `<title>YYYY-MM-DD front | Hacker News</title>`. Firebase item JSON provides `id`, `title`, optional `url`, `by`, `time`, `score`, `descendants`, `deleted`, `dead`, and `type`. The command evaluates the page DOM, preserves global rank, and returns `{snapshotDate, items}`.

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

The command requires an attached WebSculpt browser session; runner attach failures such as `BROWSER_ATTACH_REQUIRED`, `DAEMON_BUSY`, or `COMMAND_TIMEOUT` are surfaced by the runtime. Validate `date` as a real non-future `YYYY-MM-DD` because HN silently falls back for malformed dates. Missing page title/rows or required Firebase fields map to `DRIFT_DETECTED`; HTTP 429 maps to `RATE_LIMITED`, other non-2xx responses to `API_ERROR`, network failures to `NETWORK_ERROR`, and a valid empty historical page to `EMPTY_RESULT`. Use a single owned page/tab, `domcontentloaded`, bounded pagination (10 pages), and no login or account actions.

## Capture Assessment

<!-- State whether this command should be captured and why. -->

Capture is appropriate: the route was verified against real HN pages and Firebase item data, the browser runtime preserves exact past-page semantics when Node cannot reach the HN domain, and the user explicitly approved the runtime switch. The command complements existing Hacker News actions without conflict; finalize will intentionally replace the broken Node runtime artifact for the same `hackernews/get-past` action.
