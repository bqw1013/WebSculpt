# github/list-contributors

List a GitHub repository's contributors ordered by contribution (commit) count, from the contributors chart page `https://github.com/<owner>/<repo>/graphs/contributors`.

## Description

Returns the top contributors of a public repository with their login, avatar URL, profile URL, and commit count, sorted by most contributions. The command reads the rendered contributors page and pulls the dataset from the page's internal endpoint (`/graphs/contributors-data`), which is the same request the page's chart makes — it does not consume the GitHub REST API quota. No login is required.

## Parameters

| name    | required | default | description |
|---------|----------|---------|-------------|
| `repo`  | yes      | -       | Repository as `owner/repo` (e.g. `facebook/react`) or its full URL `https://github.com/facebook/react`. (仓库标识：`owner/repo` 或完整 URL。) |
| `limit` | no       | `20`    | Maximum contributors to return, integer 1-100. (条数上限。) |

## Return Value

```json
{
  "repo": "react/react",
  "count": 20,
  "partial": true,
  "contributors": [
    {
      "login": "sebmarkbage",
      "avatar_url": "https://avatars.githubusercontent.com/u/63648?s=60&v=4",
      "html_url": "https://github.com/sebmarkbage",
      "contributions": 1950
    }
  ]
}
```

- `repo`: canonical `owner/repo`, resolved from the page's embedded data, so renamed/moved repos (e.g. `facebook/react` → `react/react`) are reported with their current owner/repo.
- `count`: number of contributors actually returned (`= min(limit, total)`).
- `partial`: `true` when the underlying dataset hits the endpoint's server-side cap of 500 entries, meaning the returned list may not be the complete contributor set.
- `contributors`: array sorted by `contributions` descending. Each item is `{ login, avatar_url, html_url, contributions }`.

## Usage

```
websculpt github list-contributors --repo facebook/react
websculpt github list-contributors --repo https://github.com/facebook/react --limit 50
```

## Common Error Codes

- `INVALID_PARAM` — `repo` missing/empty or not `owner/repo` / a valid GitHub URL; `limit` not an integer or outside 1-100.
- `NOT_FOUND` — the repository does not exist (GitHub 404 page).
- `EMPTY_RESULT` — the repository has no contributor data (e.g. no commits yet).
- `NETWORK_ERROR` — page load or internal fetch failed.
- `DRIFT_DETECTED` — the contributors page structure changed and `embeddedData`/`graphDataPath` is missing.
- `BROWSER_ATTACH_REQUIRED` — browser not connected (infrastructure error, raised by the runner).
