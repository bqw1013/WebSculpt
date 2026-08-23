# producthunt/get-stories

Generated draft for a `browser` runtime command.

## Description

Lists Product Hunt Stories for discovery. With no filter it returns the featured Stories and the current More stories feed. `--category` opens a verified Story category page; `--query` submits the verified Search Stories control on the main feed. These filters are mutually exclusive. No Product Hunt login is required.

## Parameters

- `--category <slug>`: optional category slug such as `makers`, `news`, or `how-to`.
- `--query <text>`: optional text for the main Stories search control.
- `--limit <number>`: local cap from 1 through 25; default 25. It does not request another upstream page.
- `--detailed <true|false>`: default `false`; adds description, image, section, category details, and retrieval time. Compact output already includes author URLs and pagination metadata.

## Return Value

Returns `{ sourceUrl, filter, resultScope, items, count, sourceCount, pagination }`. Compact items contain `id`, `title`, `slug`, `url`, `category`, `author` (including `author.url` when available), and `minsToRead`. The `pagination` object is returned in both compact and detailed modes. Detailed items additionally contain `description`, `headerImageUuid`, `imageUrl`, and `section`; detailed category results also include category description, and detailed responses include `fetchedAt`. The source can report `hasNextPage` and a cursor, but no verified page-number URL or next-page control is exposed, so pagination is reported rather than traversed.

## Usage

```
websculpt producthunt get-stories
websculpt producthunt get-stories --category makers --limit 5
websculpt producthunt get-stories --query AI --detailed true
```

## Common Error Codes

- `INVALID_PARAM`: blank or malformed filters, invalid limit/boolean, or category plus query together.
- `NOT_FOUND`: the requested Story category returned HTTP 404.
- `EMPTY_RESULT`: a valid query returned no cards.
- `DRIFT_DETECTED`: the SSR connection or verified Story search structure changed.
- `PAGE_UNAVAILABLE`: the Stories page could not be loaded.
