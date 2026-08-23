# Evidence: quora/get-answer

## Exploration Path

- Checked the WebSculpt command library: only `quora/search` exists under the `quora` domain. No existing `get-answer` command.
- Read the browser runtime contract before editing `command.js`.
- Read the browser automation guide before using `playwright-cli`.
- Used `playwright-cli` to attach a Chrome session and explored Quora answer pages in a dedicated tab.

## Verified URLs

- `https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence/answer/Lindsay-Elizabeth-34`
- `https://www.quora.com/What-is-artificial-intelligence-15/answer/Shikhar-Dhawan-59`
- `https://quorasessionwithjustintrudeau.quora.com/What-is-your-stance-on-AI-research-given-Canadas-privileged-position-in-the-field-1`
- `https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence/answer/ThisUserDoesNotExist123456789` (redirects to the question page)
- `https://www.quora.com/ThisQuestionDoesNotExist12345/answer/Lindsay-Elizabeth-34` (404)

## Structural Evidence

- Main page container: `#mainContent` (`div.q-box`, width 636px).
- Question title container: `.q-box.qu-mb--medium.qu-mt--small`, with an inner `a` holding the title and link to the question page.
- Answer body: the largest `div.q-text` inside `#mainContent` that contains `<p>` paragraphs.
- Author block: a `div.q-box` containing an `a[href*="/profile/"]` plus credential text and a relative date line such as `· 6y`.
- Metrics are plain text in `#mainContent`, e.g. `125.9K views`, `View 6,933 upvotes`, `View 75 shares`, `Upvote\n6.9K`, `74` (comments).
- About the Author card: smallest `div.q-box` containing both `About the Author` and `content views`. Example text: `40.5M content views17.5K this month`, `Active in 10 Spaces`, `Joined September 2017`.
- Comments section: identified by the presence of `Comments`, `Recommended`, and a `button` with text `View more comments`.
- Comments are nested threads. Each comment contains an author name, `· <relative time>`, body text, optional upvote count, and a `Reply` element.

## Failure Signals

- `Page Not Found` in the body and title `(1) Error` mean the question slug does not exist.
- If the author slug is invalid but the question exists, Quora silently redirects to the question page. The command detects this by checking whether the final URL still matches the answer path and whether answer content is present.
- `Something went wrong. Wait a moment and try again.` can appear on the first load of an answer page; a single reload usually recovers it.
- `inlineQueryResults` on answer pages is empty, so this command cannot rely on the GraphQL fallback used by `quora/search`.

## Capture Assessment

This path should be captured as `quora/get-answer`. The DOM selectors are stable enough for reliable extraction, and the command fills the gap between `quora/search` (discovery) and the full answer content that Quora only renders on the answer page.
