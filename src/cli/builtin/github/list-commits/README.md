# github/list-commits

Fetch a GitHub repository's commit history from `https://github.com/<owner>/<repo>/commits[/<branch>]`.

## Description

Returns a repository's recent commits with short SHA, commit message, author login, author avatar, authored date, and commit URL. When `branch` is omitted, the repository's default branch is used. The page renders 35 commits per page; requesting more than 35 follows the page's Next pagination link until `limit` is reached or the history ends. Repository renames are followed via redirect (e.g. `facebook/react` -> `react/react`).

## Parameters

- `repo` (required): `owner/repo` or a full URL, e.g. `facebook/react` or `https://github.com/facebook/react`.
- `branch` (optional): branch name, e.g. `main`, `master`. Defaults to the repository's default branch.
- `limit` (optional, default 20, range 1-100): maximum commits to return. Values above 35 trigger pagination via the page's Next link; `partial` in the output indicates whether the result was truncated at this limit.

## Return Value

```json
{
  "repo": "react/react",
  "branch": "main",
  "count": 3,
  "partial": true,
  "commits": [
    {
      "sha": "2042572329425f9ebf35ae6287ea5bab72b2c497",
      "message": "Add `onBrowserBailout` Fizz option (#37193)",
      "author": "gnoff",
      "author_avatar": "https://avatars.githubusercontent.com/u/2716369?v=4",
      "authored_at": "2026-08-07T22:31:46.000-04:00",
      "html_url": "https://github.com/react/react/commit/2042572329425f9ebf35ae6287ea5bab72b2c497"
    }
  ]
}
```

- `repo`: normalized `owner/repo` (after redirects).
- `branch`: effective branch name (default branch when `branch` omitted).
- `count`: number of commits returned.
- `partial`: `true` = the list was truncated at `limit` (more history exists); `false` = complete history returned.
- `commits[].sha`: full 40-char SHA.
- `commits[].message`: first-line commit message.
- `commits[].author`: author login.
- `commits[].author_avatar`: author avatar URL.
- `commits[].authored_at`: authored date, ISO 8601 with timezone.
- `commits[].html_url`: canonical commit URL.

## Usage

```
websculpt github list-commits --repo facebook/react
websculpt github list-commits --repo facebook/react --branch main --limit 20
websculpt github list-commits --repo https://github.com/facebook/react --limit 100
```

## Common Error Codes

- `INVALID_PARAM` — missing or invalid `repo`, `limit` out of range (1-100), or `branch` contains invalid characters.
- `NOT_FOUND` — repository does not exist, or the requested branch does not exist.
- `EMPTY_RESULT` — repository has no commits (no branch specified and none resolved).
- `BROWSER_ATTACH_REQUIRED` — no browser is connected; enable remote debugging in Chrome/Edge.
- `NETWORK_ERROR` — network failure while loading the page.
- `DRIFT_DETECTED` — GitHub page structure changed; the embedded commit data was not found.
