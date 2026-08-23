# Context

## Precipitation Background (Why This Command Exists)

Product Hunt Forums contains two related but distinct navigation groups: Topic Forums, such as `general` and `vibecoding`, and Product Forums, such as `openai` and `producthunt`. This command gives callers a lightweight thread-discovery result without conflating a thread list with a single thread's body or comments.

## Value Assessment

The command provides a reusable browser path for forum discovery. Its output is intentionally compact so a caller can decide which thread deserves a later detail command. It does not duplicate `get-product`, `get-best-products`, or the planned single-thread command.

## Page Structure

- Topic and Product Forum pages use `https://www.producthunt.com/p/<forum-slug>`.
- The rendered sidebar separates `Topic Forums` and `Product Forums`.
- Thread links on a selected forum use `/p/<forum-slug>/<thread-slug>`.
- Thread cards expose a title heading, author profile link, relative time label, optional Featured marker, excerpt paragraphs, and numeric engagement buttons.
- `/forums/search?ref=sidebar` is a search entry point, but its submitted query contract was not verified and is not implemented.
- No stable upstream page/cursor control was verified; the command reports the current rendered slice and does not claim completeness.

## Environment Dependencies

The command uses the browser runtime and requires Chrome or Edge with remote debugging enabled. Product Hunt login is not required for the verified public pages. It waits for `main`, performs one bounded pointer movement after a 200-550ms randomized pause, and waits 0-2s before a successful return. There are no repeated scroll loops or long artificial delays.

## Failure Signals

- `BROWSER_ATTACH_REQUIRED` is supplied by the runtime when the browser prerequisite is unavailable.
- `NOT_FOUND` is returned when the page presents a 404/not-found signal.
- `EMPTY_RESULT` is returned when a valid forum page has no rendered thread cards.
- `DRIFT_DETECTED` is returned when the main container or selected forum marker disappears.
- `INVALID_PARAM` is returned for malformed slugs, limits outside 1-50, or non-boolean detailed values.

## Repair Clues

If the command reports `DRIFT_DETECTED`, first inspect a current Topic Forum and Product Forum page. Preserve the `/p/<forum-slug>/<thread-slug>` boundary and the separation between forum navigation and thread cards. If Product Hunt later exposes a stable search or pagination parameter, add it only after browser verification and update the explicit `pagination`/README contract rather than silently inferring it.
