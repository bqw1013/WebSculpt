# Context

## Precipitation Background (Why This Command Exists)

Product Hunt command planning separates forum lists from single-thread details. `get-forum-threads` helps callers choose a forum/thread; this command retrieves the selected thread body and replies without requiring a second exploration.

## Value Assessment

The route is reusable across Topic Forums and Product Forums. Stable forum/thread slugs, canonical URLs, timestamps, reply pagination, and bounded output make it useful for follow-up analysis while keeping the default result compact.

## Page Structure

- Canonical thread URL: `https://www.producthunt.com/p/{forumSlug}/{threadSlug}`.
- Optional reply page: `?page=N#comments`.
- The main `h1` identifies the thread. The first pre-`Replies` time is the thread timestamp. Paragraph/list nodes before `Replies` form the body. `/products/` links identify product associations.
- The `Replies` heading marks the reply region. Reply cards contain author controls, text paragraphs, a `time[datetime]`, optional product links, and action controls. Pagination links contain `#comments`.

## Environment Dependencies

The browser runtime requires an existing Chrome or Edge instance reachable by WebSculpt. Product Hunt samples were publicly readable without login. The command uses no third-party package, waits briefly after navigation, performs one light mouse move, and waits 0-2 seconds before returning. It does not close the injected page.

## Failure Signals

Missing/invalid parameters are rejected before navigation. A not-found page maps to `NOT_FOUND`; an empty requested reply page maps to `EMPTY_RESULT`; missing `main`, `h1`, or `Replies` markers maps to `DRIFT_DETECTED`. Infrastructure-level browser prerequisite errors remain owned by the runtime.

## Repair Clues

If the route changes, verify the two slug segments first. If body extraction drifts, preserve the `h1`/`Replies` boundary and update the paragraph/list selectors. If reply cards change, keep the `time` and action markers as anchors. If pagination changes, re-check links containing `#comments` before changing the `page` contract. Re-run capture validation after any draft edit and finalize only from the draft.
