# Evidence: quora/get-profile

This document records the research and validation evidence for the `quora/get-profile` command.

## Exploration Path

- Checked the WebSculpt command library: only `quora/search` exists; no command fetches a single user profile or its sub-sections.
- Read the browser automation guide.
- Attached Playwright CLI to a Chrome session and explored all target pages in a single owned tab.
- Used `goto`, `run-code`, `eval`, `snapshot`, and `requests` to inspect page structure, lazy loading, GraphQL query names, and error pages.
- Verified DOM extraction paths with real data samples and recorded failure signals.

## Verified URLs

- `https://www.quora.com/profile/Hector-Quintanilla`
- `https://www.quora.com/profile/Hector-Quintanilla/answers`
- `https://www.quora.com/profile/Hector-Quintanilla/answers/published`
- `https://www.quora.com/profile/Hector-Quintanilla/questions`
- `https://www.quora.com/profile/Hector-Quintanilla/posts`
- `https://www.quora.com/profile/Hector-Quintanilla/followers`
- `https://www.quora.com/profile/Hector-Quintanilla/following`
- `https://www.quora.com/profile/Hector-Quintanilla/log`
- `https://www.quora.com/profile/Hector-Quintanilla/spaces` (404)
- `https://www.quora.com/profile/ThisUserDoesNotExist123456789` (redirects to 404)

## Structural Evidence

### Profile header (all sections share the same header)

- Name appears as plain text after the top navigation and before the credential.
- Credential is the line immediately below the name.
- Follower/following counts can be matched with regex: `([\d,.KMB]+)\s+followers?` and `([\d,.KMB]+)\s+following`.
- Tab counts appear after the "Profile" tab label: `1.5K Answers`, `87 Questions`, `718 Posts`, `200K Followers`.
- Bio text sits between the "Ask" button and the "Profile" tab label.
- Sidebar "Credentials & Highlights" contains employment, education, location, content views, languages, join date, and active Spaces.

### Section-specific structures

- **answers** (`/profile/<name>/answers`)
  - GraphQL: `UserProfileAnswersMostRecent_RecentAnswers_Query`
  - Sort labels: `Most recent` (default), `Pinned answer`
  - Cards: question link (`a[href*="/answer/"]`), author credential, relative time, excerpt, upvote/comment/share counts
  - Infinite scroll confirmed: answer links increased from 3 to 9 after scrolling.

- **questions** (`/profile/<name>/questions`)
  - GraphQL: `UserProfileQuestionsList_Questions_Query`
  - Items: question title links ending with `?`, answer count, `Last followed Xy` text

- **posts** (`/profile/<name>/posts`)
  - GraphQL: `UserProfilePostsList_Posts_Query`
  - **Posts are Space-hosted**: URLs are `https://<space-slug>.quora.com/<post-slug>` instead of `/post/<id>`.
  - Cards: Space name, `Posted by <name> · <time>`, excerpt, upvote/comment counts
  - Initial render may not show the feed; scrolling is required to trigger content.

- **followers** (`/profile/<name>/followers`)
  - GraphQL: `UserProfileFollowers_ProfileTopics_Query`
  - Items: user cards with profile links (`a[href*="/profile/"]`) excluding the target user.

- **following** (`/profile/<name>/following`)
  - GraphQL: `UserProfileFollowingSpaces_ProfileTopics_Query`
  - **Important**: this tab lists Spaces the user follows, not people.
  - Items: Space name, follower count, description, Space subdomain link.

- **log** (`/profile/<name>/log`)
  - Page title in UI is `Edits`
  - Items: text blocks such as `Answer added by <name>` or `Comment added by <name>`, plus target title and timestamp.

### Data source

- `window.ansFrontendGlobals.data.inlineQueryResults` is mostly empty arrays on profile pages, unlike `quora/search`.
- Therefore the implementation relies on DOM text extraction and stable URL patterns rather than the inline GraphQL cache.

## Failure Signals

- **404 / not found**: body text contains `Page Not Found` and title becomes `(1) Error`. Non-existent users are redirected from `/profile/<name>` to `/<name>` before showing the 404.
- **Lazy-load failure**: `domcontentloaded` alone is insufficient; list sections may return zero items if extracted immediately. Implementation must wait for representative elements (e.g., `a[href*="/answer/"]` for answers, question links for questions, profile links for followers).
- **Posts initial blank**: the `/posts` page may show only header and sidebar until scrolled; long wait + scroll is required.
- **Rate limiting**: Cloudflare turnstile scripts are loaded. During exploration no visible CAPTCHA appeared, but aggressive repeated navigation could trigger stronger checks.
- **Structure drift**: no stable `data-testid` attributes were observed; selectors depend on URL patterns and text regex, which are sensitive to redesigns.

## Capture Assessment

- The path is reproducible and parameterizable by user name and section.
- All seven sections (including the default profile feed) were successfully extracted with live samples.
- The main risk is Quora's lazy rendering and reliance on text-based selectors, which requires robust waits and drift detection.
- Capture as `quora/get-profile` with `browser` runtime is recommended.
