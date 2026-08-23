# github/get-pull

Fetch a single GitHub pull request's full detail by number, from the rendered PR page (https://github.com/{owner}/{repo}/pull/{number}).

## Description

Returns number, title, state, merged/mergeable flags, author, full body text, base/head refs, labels, assignees, commit/change/review counts, and created/closed/merged dates. Pass `--include_files true` to also load the Files changed list (each file with filename, status, additions and deletions). Reads the rendered PR page plus GitHub's own internal page_data endpoints; does not use the GitHub REST API, so no API quota limits. No login required.

## Parameters

| name | required | default | description |
|------|----------|---------|-------------|
| `repo` | yes | - | Repository as `owner/repo` (e.g. `facebook/react`) or a full URL `https://github.com/facebook/react`. A repo alias (e.g. `facebook/react` -> `react/react`) is resolved automatically via GitHub's redirect. |
| `number` | yes | - | Pull request number (positive integer), e.g. `37251` in `https://github.com/react/react/pull/37251`. Get numbers from `github list-pulls` or the PR page URL. |
| `include_files` | no | `false` | Set to `true` to also return the changed-files list (`files` array). Loading the `.diff` endpoint makes the command slightly slower. |

## Return Value

```json
{
  "number": 37251,
  "title": "Fix Fragment ref event listener registry identity",
  "state": "open",
  "merged": false,
  "mergeable": true,
  "html_url": "https://github.com/react/react/pull/37251",
  "author": "teamleaderleo",
  "body": "Summary\n\nCurrently, ...",
  "base_ref": "main",
  "head_ref": "repair/fragment-remove-unregistered-listener",
  "labels": ["CLA Signed"],
  "assignees": [],
  "commits": 1,
  "additions": 165,
  "deletions": 6,
  "changed_files": 2,
  "checks": 7,
  "reviews": 0,
  "is_draft": false,
  "created_at": "2026-08-08T22:15:43Z",
  "closed_at": null,
  "merged_at": null,
  "merged_by": null,
  "files": [
    { "filename": "packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js", "status": "modified", "additions": 9, "deletions": 6, "changes": 15 }
  ]
}
```

Field semantics:
- `state`: `open` | `closed` | `merged` (GitHub's three PR states, lowercased from the page data).
- `merged`: `true` when the PR has a merge timestamp (`merged_at != null`).
- `mergeable`: meaningful only for open PRs — `true` (no conflicts) / `false` (conflicts) from GitHub's merge-conflict condition; `null` for closed/merged PRs (no conflict condition is computed).
- `reviews`: number of opinionated reviews (latest per reviewer, from GitHub's merge-box data; states include APPROVED / CHANGES_REQUESTED / COMMENTED).
- `additions`/`deletions`/`changed_files`: totals from GitHub's own page_data diffstat/tab-counts endpoints.
- `files` (only when `include_files=true`): per-file changes parsed from the `.diff` plain-text endpoint; `status` is one of `modified` | `added` | `deleted` | `renamed`. Per-file totals sum to `additions`/`deletions`.
- Dates are normalized to UTC ISO 8601.

## Usage

```
websculpt github get-pull --repo facebook/react --number 37251
websculpt github get-pull --repo https://github.com/facebook/react --number 37251 --include_files true
```

## Common Error Codes

- `INVALID_PARAM` — `repo` cannot be parsed to owner/repo, or `number` is not a positive integer.
- `NOT_FOUND` — repository or pull request does not exist (HTTP 404, or the number redirects to `/issues/{n}` which 404s).
- `EMPTY_RESULT` — page loaded but no PR metadata could be extracted.
- `NETWORK_ERROR` — navigation failed, GitHub rate-limited/blocked the request (HTTP 429/403), or GitHub's page_data endpoints are unreachable.
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging is connected (raised by the runtime, not this command).

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. No login required. Public PR data is read; logged-in sessions additionally surface branch-protection details in the merge box, but the core fields work anonymously.
