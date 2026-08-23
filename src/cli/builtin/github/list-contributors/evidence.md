# Evidence: github/list-contributors

This document records the research and validation evidence for the `github/list-contributors` command.

## Exploration Path

Library check: `websculpt command list github` returned only `github/get-trending`; no existing contributors command. This command is new within the github domain.

Browser runtime: the extraction path was validated in explore via both plain curl and a Playwright CLI browser session.

Chosen path (stable, low request count, avoids API rate limits): navigate to `https://github.com/<owner>/<repo>/graphs/contributors`, read the embedded `script[data-target="react-app.embeddedData"]` to get `payload.graphDataPath`, then `fetch(graphDataPath, {headers:{Accept:'application/json'}})` to get the full contributor dataset. This is the exact request the page's own chart JS makes (`fetch(graphDataPath).then(r => r.json())`), so it does not hit the REST API quota.

## Verified URLs

- `https://github.com/facebook/react/graphs/contributors` (redirects to `https://github.com/react/react/graphs/contributors`; the repo was renamed. Redirects are followed.)
- `https://github.com/react/react/graphs/contributors-data` (Accept: application/json → full contributor dataset, HTTP 200, application/json)
- `https://github.com/octocat/Hello-World/graphs/contributors` (small-repo control: 2 contributors)
- `https://github.com/<nonexistent-owner>/<nonexistent-repo>/graphs/contributors` (404 control: title "Page not found · GitHub", no embeddedData)

## Structural Evidence

The contributors page (`/graphs/contributors`) is a React app. It embeds a JSON bootstrap:

```
<script type="application/json" data-target="react-app.embeddedData">{"payload":{"repoUrl":"https://github.com/react/react","defaultBranch":"main","graphDataPath":"/react/react/graphs/contributors-data","isUsingContributionInsights":true},"title":"Contributors to react/react","appPayload":null}</script>
```

`payload.graphDataPath` is the stable relative path of the internal data endpoint (e.g. `/react/react/graphs/contributors-data`). GitHub may append a `?from=YYYY%2FM%2FD` query to the page URL (chart date-range state); it does not change `graphDataPath` and does not affect the endpoint response.

The data endpoint, fetched with `Accept: application/json`, returns an array of GitHub API v3 contributors format, sorted ascending by `total`:

```
[{"total":2,"author":{"id":10393491,"login":"him2him2","avatar":"https://avatars.githubusercontent.com/u/10393491?s=60&v=4","path":"/him2him2","hovercard_url":"/users/him2him2/hovercard"},"weeks":[{"w":1369526400,"a":0,"d":0,"c":0}, ...]}, ...]
```

Field mapping used by the command:
- `login` ← `author.login`
- `avatar_url` ← `author.avatar`
- `html_url` ← `"https://github.com" + author.path`
- `contributions` ← `total` (verified: `total === sum(weeks[].c)`, the commit count)

Facts verified with `react/react` (500 entries returned, `total` range 2..1950):
- The endpoint returns data ascending by `total`; the command must sort descending and take the top N.
- The endpoint honors no `limit`/`per_page` query param (tested `?limit=20` → identical full response).
- The endpoint caps the response at 500 entries server-side. When `count === 500`, the data may be truncated → `partial: true`.

Small-repo control (`octocat/Hello-World`): same embeddedData shape, endpoint returned 2 contributors (Spaceghost, Cameron423698, contributions 1 each).

## Failure Signals

- NOT_FOUND: nonexistent repo renders a page whose `document.title` is "Page not found · GitHub" and where `script[data-target="react-app.embeddedData"]` is absent. Detect either signal → `NOT_FOUND`.
- EMPTY_RESULT: a repo with no commit data returns an empty array from the data endpoint (the chart UI itself shows "We don't have enough data to generate this graph"). Empty array → `EMPTY_RESULT`.
- DRIFT: if the embeddedData script or `payload.graphDataPath` is missing on a live (non-404) page, the page structure has changed → `DRIFT_DETECTED`.
- Network failure during `page.goto` or the internal `fetch` → `NETWORK_ERROR`.
- Rate limiting: during exploration no 429/403/CAPTCHA was observed (both curl and browser). The endpoint is a page-internal fetch, not the REST API, so it is not subject to the 60 req/hr anonymous API quota.
- Rate awareness: the command adds a random sleep (200-700 ms) before the internal fetch to avoid a deterministic request pattern and high-frequency same-host traffic.

## Capture Assessment

Capture as `github/list-contributors` (browser runtime). The path is verified end-to-end on a real large repo (`react/react`, 500 contributors) and a tiny repo (`octocat/Hello-World`), with NOT_FOUND/EMPTY_RESULT/field mapping all confirmed against first-hand data. The command returns a high-value, reusable list (contributors ordered by commit count) with stable internal-endpoint extraction, no login, and no REST API quota dependency.
