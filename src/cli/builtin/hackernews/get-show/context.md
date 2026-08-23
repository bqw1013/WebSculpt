# Context

## Precipitation Background (Why This Command Exists)

Hacker News exposes Show HN as a ranked listing at `/show`. The Firebase `showstories` feed is useful but can briefly lag a live page refresh, so this command captures the verified page semantics directly. The command complements `hackernews/get-new` and `hackernews/get-past` without changing either one.

## Value Assessment

The path is reusable for repeated Show HN monitoring: one page navigation returns up to 30 rows, and a second `show?p=2` navigation extends the result to the bounded maximum of 50.

## Page Structure

Navigate to `https://news.ycombinator.com/show` and, when needed, `https://news.ycombinator.com/show?p=2`. Each story is `tr.athing`; its numeric `id` is the story ID and `.titleline a` contains the project title/link. The following row's `.subtext` contains `.score`, `.hnuser`, `.age[title]`, and the item/discussion link. The `a.morelink` href signals another page.

## Environment Dependencies

Requires Chrome or Edge with remote debugging enabled so WebSculpt can attach. HN is public and no login is needed. The command uses one browser page per invocation, waits for `tr.athing`, and limits requests to at most two pages for `limit <= 50`.

## Failure Signals

Navigation failures map to `NETWORK_ERROR`; HTTP 429 maps to `RATE_LIMITED`. Missing story rows or required fields (`id`, title, item URL, author, timestamp) map to `DRIFT_DETECTED`; zero rows map to `EMPTY_RESULT`. Invalid limits map to `INVALID_PARAM`.

## Repair Clues

If HN changes row markup, update the selectors from a fresh browser explore and re-run `explore assess` before capture repair. The verified Firebase `showstories` endpoint can help diagnose ordering, but should not silently replace the page path because it may be temporarily stale.
