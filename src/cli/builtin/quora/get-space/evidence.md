# Evidence: quora/get-space

This document records the research and validation evidence for the `quora/get-space` command.

## Exploration Path

- Checked the WebSculpt command library: existing `quora/search` can discover Spaces but cannot fetch a single Space's content.
- Read the browser automation guide before using the browser.
- Attached Playwright CLI to a Chrome session and created a dedicated tab for exploration.
- Verified Space page structure, tab routing, sort behavior, feed lazy-loading, About/Contributors, and error cases through live browser evaluation.

## Verified URLs

- `https://thestoics.quora.com/` — default Posts (Top) stream
- `https://thestoics.quora.com/?sort=recent` — Posts Recent stream
- `https://thestoics.quora.com/?sort=top` — returns only top posts, not equivalent to default Top mixed stream
- `https://thestoics.quora.com/?sort=pinned` — returns empty stream
- `https://thestoics.quora.com/?questions` — Questions tab
- `https://thestoics.quora.com/?questions&sort=recent` — same as `?questions`
- `https://thestoics.quora.com/?questions&sort=top` — returns only 4 questions
- `https://thestoics.quora.com/?about` — About tab with Details and Contributors
- `https://thestoics.quora.com/questions` — 404 Page Not Found
- `https://science.quora.com/` — verified selectors generalize across languages
- `https://nonexistent-space-12345.quora.com/` — redirects to `https://www.quora.com/`

## Structural Evidence

### Header metadata

- Space name selector: `.puppeteer_test_tribe_name`
- Header info block: `.puppeteer_test_tribe_info_header`
- Header text format (Stoicism example):

```text
Stoicism
A philosophy designed to make you a wiser, happier, more resilient person.
122 Contributors
372.1K followers
32 posts in the last week
```

- Counts and activity text may use localized numerals (e.g., Devanagari digits on `science.quora.com`). Parsing must use `\p{Nd}` (Unicode digits) rather than ASCII-only `\d`.

### Tabs and routing

- Tab selectors:
  - Posts: `.puppeteer_test_tribe_tab_main`
  - Questions: `.puppeteer_test_tribe_tab_questions`
  - About: `.puppeteer_test_tribe_tab_about`
- Actual navigation uses query parameters, not path segments:
  - Posts Recent: `?sort=recent`
  - Questions: `?questions`
  - About: `?about`

### Feed items

- Post cards: `.puppeteer_test_tribe_post_item_feed_story`
- Answer cards: `.puppeteer_test_tribe_answer_feed_story`
- Question cards: `.puppeteer_test_question_component_base`
- Question title: `.puppeteer_test_question_title`
- Each feed item contains author name, credential, relative timestamp, excerpt, main URL, upvote count, and (for posts/answers) comment count.

### Questions tab

- Example question item (Stoicism):

```json
{
  "title": "If achieving success requires compromising your integrity, is success still worth celebrating? Why or why not?",
  "url": "https://thestoics.quora.com/If-achieving-success-requires-compromising-your-integrity-is-success-still-worth-celebrating-Why-or-why-not",
  "answerCount": "4 answers",
  "lastFollowed": "Last followed 15h"
}
```

- Questions tab returned only 4 items for both tested Spaces and did not load more on scroll.

### About / Contributors

- About tab exposes a long "Details" text.
- Contributors are rendered inside the About tab and lazy-load on scroll.
- Contributor row contains a profile link and credential text, e.g.:

```json
{
  "name": "Shadow and Reason",
  "profileUrl": "https://www.quora.com/profile/Shadow-and-Reason",
  "credential": "Applies Stoic philosophy to modern anxiety & control"
}
```

### GraphQL reference

- Feed data is fetched via `POST /graphql/gql_para_POST?q=MultifeedQuery`.
- Response path: `data.multifeedObject.multifeedConnection.edges[].node.stories[]`.
- Story typenames include `TribePostItemFeedStory` and `TribeAnswerFeedStory`.
- `pageInfo.hasNextPage` and `pageInfo.endCursor` indicate infinite-scroll pagination.
- Implementation uses DOM extraction rather than replaying GraphQL, because the query is large and the DOM selectors are stable.

## Failure Signals

- **Space does not exist**: Quora redirects the subdomain to `https://www.quora.com/` instead of showing a 404 page. Detect by checking the final URL or absence of `.puppeteer_test_tribe_name`.
- **Wrong path**: `/<space>.quora.com/questions` returns a 404 "Page Not Found" page.
- **Login wall**: Anonymous access may trigger login prompts or reduced content.
- **Rate limiting**: Cloudflare challenge requests appeared in the network log but did not block rendering. Random waits, small scrolls, and mouse movements are used to keep polite pacing.
- **Drift**: If the `puppeteer_test_*` classes disappear or the header format changes, extraction will return empty/null and should raise `DRIFT_DETECTED`.

## Capture Assessment

- This command should be captured. The Space page structure is stable, the selectors are explicit `puppeteer_test_*` classes, and the use case (fetching a Space's metadata and one of its views) is clearly reusable.
- The main implementation trade-off is DOM extraction over GraphQL replay: it is simpler, less sensitive to query/hash changes, and sufficient for the requested output fields.
