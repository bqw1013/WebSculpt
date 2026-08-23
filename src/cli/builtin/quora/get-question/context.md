# Context

## Precipitation Background

`quora/search` can find questions but cannot return the answer list under a specific question. Users need a dedicated command to fetch a question's metadata and its answer preview cards, which can then be fed into `quora/get-answer` for full text.

## Value Assessment

- High reuse value: question pages are the primary content unit on Quora.
- Clear downstream chain: `quora/search` → `quora/get-question` → `quora/get-answer`.
- Parameterizable: URL/slug, limit, sort, and optional related questions.

## Page Structure

- URL: `https://www.quora.com/<question-slug>`
- Title: `h1`
- Topics: `a[href*="/topic/"]`
- Answer stream: infinite scroll; answer cards use `.spacing_log_answer_header`
- Answer card header: `.spacing_log_answer_header`
- Answer preview: `.puppeteer_test_answer_content`
- Upvote/comment action bar: `.dom_annotate_answer_action_bar_upvote`
- Sort trigger: element whose text is `SortRecommended` or `SortRecent`
- Related questions trigger: element with text `All related (N)`

## Environment Dependencies

- Chrome / Edge with remote debugging enabled.
- A logged-in Quora session is strongly recommended; anonymous access may hit login walls.
- The command adds random waits and mouse movements to keep polite pacing.

## Failure Signals

- Title contains `"Error"` and body contains `"Page Not Found"` → `NOT_FOUND`.
- Selectors `h1` or `.puppeteer_test_question_main` missing → `DRIFT_DETECTED`.
- Body shows login prompts and no title → `AUTH_REQUIRED`.
- Answer counts or selector classes change → update the DOM extraction logic.

## Repair Clues

- If `.puppeteer_test_*` classes disappear, look for new `q-box` wrapper classes or `data-testid` attributes.
- If sort switching breaks, verify the dropdown text is still `SortRecommended` / `SortRecent`.
- If related questions stop appearing, check whether the trigger text changed from `All related` to `Related questions`.
- As a fallback, the GraphQL query `QuestionAnswerAreaSectionQuery2` contains the same data, but replicating it requires Quora's form-key/cookies.
