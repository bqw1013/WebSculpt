# Evidence: quora/get-question

This document records the research and validation evidence for the `quora/get-question` command.

## Exploration Path

- Checked the WebSculpt command library: only `quora/search` exists in the `quora` domain.
- Read the browser runtime contract and the Playwright CLI explore guide.
- Attached Playwright CLI to a Chrome session and reused a single owned tab for all page visits.
- Verified pages using `playwright-cli eval`, `run-code`, and network inspection.

## Verified URLs

- `https://www.quora.com/How-do-I-write-a-diary-entry-from-a-characters-point-of-view`
- `https://www.quora.com/How-do-I-write-a-diary-entry-from-a-characters-point-of-view/log`
- `https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence`
- `https://www.quora.com/ThisQuestionDoesNotExist12345` (404 error page)

## Structural Evidence

### Question metadata

- Title selector: `h1`
- Topic tags: `a[href*="/topic/"]`; `href` is absolute and the text is the topic name.
- Answer count is read from the header text: `Answers (N)`, `N Answers`, or `N answers`.
- `followerCount` is not exposed on the question page.

### Answer cards

- Answer card header: `.spacing_log_answer_header`
- Answer preview content: `.puppeteer_test_answer_content`
- Upvote area: `.dom_annotate_answer_action_bar_upvote`
- Header text pattern: `{author name} · Follow {credential} · {publishedAt}`
- Author profile link: `a[href*="/profile/"]` inside the header
- Answer URL link: `a[href*="/answer/"]` inside the header (usually on the date)
- Comment count: action-bar button `aria-label` such as `"3 comments"`
- Merged-source detection: the answer URL's question slug differs from the current question slug.

### Related questions

- Trigger element text: `All related (N)`
- Related question cards after clicking: `.puppeteer_test_question_title` with a parent `<a href="...">`
- Some unanswered related questions use the `/unanswered/` path prefix.

### Loading & sorting

- Answer stream uses infinite scroll.
- Sort dropdown has two options: `Recommended` (default) and `Recent`.
- Adding `?sort=recent` to the URL is ignored on initial load; the dropdown must be clicked.
- GraphQL pagination query name: `QuestionPagedListPaginationQuery`.
- Initial answer area query name: `QuestionAnswerAreaSectionQuery2`.

## Failure Signals

- 404: page title contains `"Error"` and body text contains `"Page Not Found"`.
- Login wall: no `h1` and body text contains login prompts (returns `AUTH_REQUIRED`).
- Drift: expected selectors (`h1`, `.puppeteer_test_question_main`, `.spacing_log_answer_header`) do not appear within timeout.
- Rate limiting: Cloudflare challenge requests appear in network log; mitigated by random waits and mouse movement.

## Capture Assessment

This path should be captured as `quora/get-question`. The DOM selectors are stable, the user task is clear, and the output is parameterizable. The command complements `quora/search` by returning a single question's answer list.
