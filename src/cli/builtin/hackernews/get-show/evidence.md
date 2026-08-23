# Evidence: hackernews/get-show

This document records the research and validation evidence for the `hackernews/get-show` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

- Checked `websculpt command list hackernews`: no existing `get-show`; existing `get-new`/`get-past` informed the shared story-card fields.
- The exploration skill guide and browser access documentation were read in full before browser exploration.
- The capture skill guide and the browser runtime contract document were read in full before editing this draft.
- Explore session `<session>` attached to Chrome, created one owned tab, verified its URL/title, and inspected `/show` and `/show?p=2`.

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

- https://news.ycombinator.com/show
- https://news.ycombinator.com/show?p=2
- https://hacker-news.firebaseio.com/v0/showstories.json (ordering cross-check only)
- https://hacker-news.firebaseio.com/v0/item/49090607.json (field cross-check only)

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

- The Show page contains 30 `tr.athing` story rows per page. The row `id` is the numeric story ID; `.titleline a` contains the title and project URL; the following row's `.subtext` contains `.score`, `.hnuser`, `.age[title="<ISO> <epoch>"]`, and a discussion/item link.
- A comment link has text such as `92 comments`; when there are no comments, the link text is `discuss`. The item link is the HN discussion URL. A `a.morelink` href of `show?p=2` (then `show?p=3`) provides pagination.
- `/show?p=2` also returned 30 rows. The implementation preserves row order, de-duplicates IDs across pages, and assigns a continuous output rank.
- Firebase `showstories.json` returned 200 ordered IDs. One same-time comparison matched the first 30 page IDs exactly; an earlier read showed a short-lived stale ordering, so the implementation uses the page DOM for exact `/show` semantics.

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

- Browser runtime needs Chrome/Edge remote debugging; attach failures are runner-level `BROWSER_ATTACH_REQUIRED`.
- Page navigation exceptions map to `NETWORK_ERROR`; HTTP 429 maps to `RATE_LIMITED`.
- Missing `tr.athing`, missing required fields, or changed selectors map to `DRIFT_DETECTED`; zero rows map to `EMPTY_RESULT`.
- `limit` is strictly validated as an integer from 1 to 50; invalid values map to `INVALID_PARAM`.
- Browser-side fetch to Firebase is CORS-blocked; the command intentionally extracts the already-rendered HN DOM instead of relying on that cross-origin request.

## Capture Assessment

<!-- State whether this command should be captured and why. -->

Capture is appropriate: the path was run against real HN pages, is parameterized by a bounded limit, preserves the requested Show HN ranking, has stable selectors and explicit drift/error handling, and requires no login or API key.
