# Evidence: medium/search

## Exploration Path

`websculpt command list medium` on Windows host returned `No commands available`. Read the WebSculpt exploration, access, and capture documents before exploration. Playwright CLI 0.1.17 reused the user's attached Chrome/CDP session; no new browser process was launched.

## Verified URLs

- `https://medium.com/search?q=artificial%20intelligence`
- `https://medium.com/search/users?q=artificial%20intelligence`
- `https://medium.com/search/publications?q=artificial%20intelligence`
- `https://medium.com/search/tags?q=artificial%20intelligence`
- `https://medium.com/search/lists?q=artificial%20intelligence`
- `https://medium.com/_/graphql`

## Structural Evidence

Medium exposes `window.__APOLLO_CLIENT__` and uses a same-origin GraphQL POST. The verified `SearchPosts` request uses `pagingOptions:{limit,page}`. Page 0 returned `pagingInfo.next.page=1`; a direct page 1 request returned a different set of posts. A limit of 100 returned 95 posts and a next page. The response includes `id`, `title`, `mediumUrl`, `uniqueSlug`, `creator`, `collection`, `tags`, `previewImage`, `extendedPreviewContent.subtitle`, `firstPublishedAt`, `latestPublishedAt`, `readingTime`, `clapCount`, `postResponses.count`, `isLocked`, and native `__typename` values.

The verified entity query returned `SearchPeople`, `SearchCollection`, `SearchTag`, and `SearchCatalog` items with native IDs and metadata. The visible pages use `article[data-testid="post-preview"]`, `[data-testid="search-user-preview"]`, and `[data-testid="search-pub-preview"]`; topics/lists are available under `main` with visible nav and result lines.

## Failure Signals

The command treats navigation/transport non-2xx, invalid JSON, GraphQL errors, missing schema arrays, and missing DOM results as drift candidates. A valid API empty array is returned without fallback. Fallback re-navigates to the exact type URL, waits for a selector, and returns `source:"dom"`, `fallbackUsed:true`, `partial:true`. If API and DOM both fail, it throws `DRIFT_DETECTED`.

## Capture Assessment

`websculpt explore assess medium-search` passed with candidate `medium/search`; the path is parameterized, browser-reusable, and suitable for capture. API calls are serial with short randomized waits; no CAPTCHA/403/429 bypass is attempted.

## Host Validation Notes

On the Windows host, posts returned detailed native fields; `limit=100` fetched two pages and 100 unique IDs; people, publications, topics, and lists each returned native API records; `sort=latest` and `time=week` were accepted with `ignoredParams`; malformed and over-limit values returned `INVALID_PARAM` and `LIMIT_EXCEEDED`. A controlled route that returned 503 only for `SearchPosts` verified `source:"dom"`, `fallbackUsed:true`, and `partial:true`. A route that blocked all GraphQL requests verified the expected `DRIFT_DETECTED` double-failure behavior. The route was removed after testing.
