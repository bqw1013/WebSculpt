# Evidence: arxiv/search-papers

This document records the research and validation evidence for the `arxiv/search-papers` command.

## Exploration Path

1. Checked the WebSculpt command library via `websculpt command list`. No existing `arxiv` domain commands were found.
2. Explored the arxiv public API using `curl.exe` directly against `https://export.arxiv.org/api/query`.
3. Verified that the API returns structured Atom XML with complete paper metadata including title, abstract, authors, dates, categories, and PDF links.
4. Confirmed that the API supports parameterized queries (`search_query`, `start`, `max_results`, `sortBy`, `sortOrder`) and requires no authentication.

## Verified URLs

- `https://export.arxiv.org/api/query?search_query=all:agentic+AND+all:reinforcement+AND+all:learning&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending`
  - Protocol: HTTPS required (HTTP returns 301 redirect).
  - Method: GET
  - Auth: None
  - Response: Atom XML feed with `entry` elements for each paper.

## Structural Evidence

The API returns an Atom XML feed with the following structure per paper (`entry`):

- `id`: Paper URL (e.g., `http://arxiv.org/abs/2605.06642v1`)
- `title`: Paper title
- `summary`: Paper abstract
- `published`: Submission date (ISO 8601)
- `updated`: Last update date (ISO 8601)
- `author/name`: Author name (repeated for each author)
- `category@term`: Subject category (repeated; primary category distinguished by `arxiv:primary_category@term`)
- `arxiv:comment`: Optional submission comment
- `link[@rel='alternate']@href`: HTML abstract page URL
- `link[@title='pdf']@href`: Direct PDF URL

Query parameters:
- `search_query`: Boolean query using arxiv search syntax (e.g., `all:keyword`, `ti:title`, `au:author`)
- `start`: Zero-based offset for pagination
- `max_results`: Number of results to return (1–50 recommended)
- `sortBy`: `relevance`, `lastUpdatedDate`, or `submittedDate`
- `sortOrder`: `ascending` or `descending`

## Failure Signals

- **Rate limiting**: arxiv recommends ~3 seconds between requests. Excessive requests may result in temporary blocks.
- **HTTP 301**: Using `http://` instead of `https://` triggers a permanent redirect. The command must use HTTPS.
- **Empty results**: Valid query with no matches returns a feed with zero `entry` elements. Should be handled gracefully.
- **Malformed query**: Invalid `search_query` syntax may return empty results or HTTP errors.
- **Large `max_results`**: Values above ~1000 may be silently capped or rejected.

## Capture Assessment

This path should be captured because:
- The arxiv API is a stable, official, public interface with no auth requirements.
- The output is fully structured (Atom XML) and maps cleanly to JSON.
- The query is highly parameterizable: keywords, result count, sort field, and sort order can all be exposed as command arguments.
- It provides first-party data, avoiding the instability of search-engine intermediaries.
- The command fills a gap in the current library (no existing arxiv commands).
