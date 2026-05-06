# Context

## Background

This command was captured on 2026-04-28 to address the issue that the GitHub Trending page is client-side rendered (CSR) and cannot be fetched via static scraping. It reuses the user's browser CDP session and extracts the repository list from the DOM using `page.evaluate()`.

## Value Assessment

High. GitHub Trending is a frequently requested data source across many domains. Changing `language` and `since` parameters enables reuse for diverse scenarios without re-implementation.

## Page Structure / Data Source Characteristics

- **Target URLs**:
  - All languages: `https://github.com/trending?since={daily|weekly|monthly}`
  - By language: `https://github.com/trending/{language}?since={daily|weekly|monthly}`
- **Key Selectors**:
  - Repository row container: `article.Box-row`
  - Repository name: `h2 a` (text in `owner / repo` format)
  - Description: `p.col-9`
  - Programming language: `[itemprop="programmingLanguage"]`
  - Stars today: `span.d-inline-block.float-sm-right`
- **Interaction Sequence**: No interaction needed; data is present in the DOM immediately after page load.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- The GitHub Trending page is public and **does not require authentication**.
- Keep access frequency reasonable to avoid triggering GitHub anti-bot measures.

## Failure Signals

- The `article.Box-row` selector returns an empty NodeList while the page has finished loading.
- All extracted repositories have an empty `name` field.
- The page title no longer contains the word "Trending".
- Throws `DRIFT_DETECTED` error.

## Fix Hints

- GitHub may change frontend class names. If `Box-row` breaks, confirm the page loaded correctly via the title `Trending repositories on GitHub`, then locate the container by searching for ancestor elements that contain `stargazers` or `programmingLanguage`.
- If GitHub moves Trending data to a fully API-driven model (e.g., GraphQL), consider switching to the `node` runtime + `fetch` to call internal APIs, but be mindful of authentication and rate limits.
- Fallback entry: GitHub Search API (`api.github.com/search/repositories`) sorted by `sort=stars` can serve as an approximate alternative, though the results differ from the official Trending algorithm.
