# Evidence: hackernews/get-new

This document records the research and validation evidence for the `hackernews/get-new` command.

## Exploration Path

The existing Hacker News command library was checked before capture. `hackernews/get-top` reads the current front-page selection and `hackernews/search` performs keyword search; neither returns the chronological `new` feed. The official Hacker News API documentation and live API responses were verified during the paired `hackernews-get-new` explore workspace. This capture uses the documented Firebase HTTP API and does not use browser automation.

## Verified URLs

- https://github.com/HackerNews/API
- https://hacker-news.firebaseio.com/v0/newstories.json
- https://hacker-news.firebaseio.com/v0/item/49094986.json

## Structural Evidence

`GET /v0/newstories.json` returns an ordered JSON array of newest story IDs. A verified response began with `[49094986, 49094984, 49094983, 49094980, 49094973]`.

`GET /v0/item/{id}.json` returns an item object. The verified story object included `id`, `type`, `title`, `url`, `by`, `time`, `score`, and `descendants`. `time` is Unix seconds. `url` may be absent for a text post. A Hacker News discussion URL can be constructed deterministically as `https://news.ycombinator.com/item?id={id}`.

The documented list contains up to 500 new-story IDs. The command must preserve the API list order, fetch only enough item details to satisfy the requested limit, and skip records that are deleted, dead, or not `type: "story"`.

## Failure Signals

Network failures, timeouts, non-2xx responses, and invalid JSON are possible. An item can be `null`, `deleted`, `dead`, or unexpectedly missing required fields; these are skipped when possible and treated as `DRIFT_DETECTED` if the required list or item structure changes materially. A 429 response maps to `RATE_LIMITED` and must not be retried. The command uses at most six concurrent item requests, a per-request timeout, and one retry only for transient network failures.

## Capture Assessment

Capture is appropriate. The API path is public, documented, authenticated by neither browser nor key, and returns a stable structured representation of the required `new` feed. It has already been exercised with real data and can be parameterized solely by a bounded `limit`.
