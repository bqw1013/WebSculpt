# Evidence: hackernews/get-jobs

This document records the research and validation evidence for the `hackernews/get-jobs` command.

## Exploration Path

Checked `websculpt command list hackernews`: existing `get-new`, `get-past`, `get-top`, and `search`; no `get-jobs`. A prior explore workspace was created for this path and passed `websculpt explore assess`; the exploration and capture skill guides and the browser runtime contract document were read in full, and the browser contract was confirmed before capture.

## Verified URLs

- https://news.ycombinator.com/jobs
- https://news.ycombinator.com/jobs?next=48656219&n=31
- https://hacker-news.firebaseio.com/v0/jobstories.json
- https://hacker-news.firebaseio.com/v0/item/49072523.json
- https://hacker-news.firebaseio.com/v0/item/48995037.json

## Structural Evidence

The HN jobs page is static HTML (`document.documentElement.op === "jobs"`). Each listing is a `tr.athing.submission` with numeric `id`; its rank is `.rank`, title/link is `.titleline > a`, and the following row contains `.age[title]` and an HN item link. The first page has 30 rows and an `a.morelink` cursor such as `jobs?next=48656219&n=31`; the next page has ranks 31–60 and another cursor. The page link is either an external URL or an internal `item?id=...`; internal links become `url: null` and `hnUrl` stays the HN item URL. Firebase item JSON has `id`, `type:"job"`, `by`, `time` (Unix seconds), `title`, optional `url`, optional HTML `text`, and `score`; job items have no `descendants`. Firebase `jobstories.json` currently exposes only 31 IDs: its first 30 match the jobs page first page, while older paginated jobs are not present in that list. Browser page-side `fetch()` to Firebase is blocked by CORS, so the command uses browser navigation/DOM body extraction for item JSON.

## Failure Signals

The command requires a Chrome/Edge session with remote debugging; daemon-level attach failures surface as `BROWSER_ATTACH_REQUIRED`. Non-2xx/timeout navigation is mapped to `NETWORK_ERROR`, HTTP 429 to `RATE_LIMITED`, malformed or missing jobs rows/More/item fields to `DRIFT_DETECTED`, and no eligible rows to `EMPTY_RESULT`. `limit` must be an integer from 1 through 50 (`INVALID_PARAM` otherwise). The command preserves HN page order and caps traversal at the requested limit; it does not rely on the incomplete `jobstories` pagination.

## Capture Assessment

Capture is appropriate: the verified browser route reproduces the HN `jobs` navigation semantics, including 30-row cursor pagination that the public `jobstories` array does not fully cover, and enriches rows with verified Firebase job metadata.
