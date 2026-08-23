# Context

## Precipitation Background

`quora/search` returns answer cards with excerpts, but Quora truncates answers on question pages. The full text, full HTML, and comments are only available on the dedicated answer page. This command captures that page so callers can read complete answers after discovering them.

## Value Assessment

- High reuse value: answer URLs are the natural next step after search or question listing.
- Saves repeated DOM exploration for every full-answer request.
- Provides structured output that can be chained into `quora/get-profile` using the author URL.

## Page Structure

- URL patterns:
  - `https://www.quora.com/<question-slug>/answer/<author-slug>`
  - `https://<space>.quora.com/<question-slug>` (Space subdomain)
- Main container: `#mainContent`.
- Question title: `.q-box.qu-mb--medium.qu-mt--small a`.
- Answer body: largest `div.q-text` containing `<p>` paragraphs.
- Author block: a `div.q-box` containing a profile link and a relative date line (`· 6y`).
- Metrics: plain text such as `125.9K views`, `View 6,933 upvotes`, `View 75 shares`, `Upvote\n6.9K`, `74`.
- About the Author card: smallest `div.q-box` containing `About the Author` and `content views`.
- Comments section: container with `Comments`, `Recommended`, and a `View more comments` button.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled.
- A logged-in Quora session is recommended. Anonymous access may show `Something went wrong` or a login wall.
- The command adds random mouse movements, small scrolls, and waits to keep polite pacing.

## Failure Signals

- `Page Not Found` / title `(1) Error` and no `#mainContent`: question slug invalid.
- Answer body cannot be found: usually means Quora redirected an invalid author slug to the question page.
- `Something went wrong. Wait a moment and try again.`: transient GraphQL failure; the command already retries once via reload.
- Missing expected metrics or author block after reload indicates DOM drift.

## Repair Clues

- If Quora changes class names, the heuristic selectors based on `div.q-text`, `a[href*="/profile/"]`, and inner-text patterns will need tuning.
- If comments stop loading, check whether the "View more comments" button text changed.
- If login becomes mandatory, update `authRequired` in `manifest.json` and the README prerequisite section.
