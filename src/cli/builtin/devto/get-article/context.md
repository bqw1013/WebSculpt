# Context

## Precipitation Background (Why This Command Exists)

DEV.to is a common source of technical articles. A reusable command saves the cost of repeatedly exploring the Forem API and DOM structure for every article lookup.

## Value Assessment

- Generality: works for any public DEV.to article URL.
- Time saved: skips manual API/selector exploration.
- Reliability: dual path (API + browser fallback) handles routine API unavailability.

## Page Structure

- API endpoint: `GET https://dev.to/api/articles/{username}/{slug}`
- Browser fallback selectors:
  - Article container: `article.crayons-card`
  - Header: `header.crayons-article__header`
  - Title: `header h1`
  - Cover image: `.crayons-article__cover img`
  - Author: `.crayons-article__header__meta a.crayons-link.fw-bold`
  - Organization: second `a.crayons-link` when the meta block contains the text "for"
  - Publish time: `header time[datetime]`
  - Tags: `article a[href^="/t/"]`
  - Body: `#article-body` (also provides `data-article-id`)

## Environment Dependencies

- Public articles only; no authentication required.
- Browser fallback requires a running browser instance with remote debugging enabled.
- The command uses small random delays and minor scroll/mouse movements during the fallback path to keep the interaction pattern neutral.

## Failure Signals

- API HTTP 404 → `NOT_FOUND`
- API HTTP 429 / 5xx / network failure / JSON parse failure → browser fallback
- Browser page title starts with `404:` or article container missing → `NOT_FOUND`
- Article container present but title/body empty → `EMPTY_RESULT`

## Repair Clues

- If selectors drift, re-verify the structure of `article.crayons-card` and `header.crayons-article__header`.
- If the API path changes, check the latest Forem API documentation at `https://developers.forem.com/api`.
