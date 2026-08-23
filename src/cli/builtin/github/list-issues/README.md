# github/list-issues

## Description

List a GitHub repository's issues (open / closed / all), ordered by created / updated / comments, from `https://github.com/<owner>/<repo>/issues`. Reads the repository's own data source (same-origin GraphQL), so it is not subject to the REST API anonymous rate quota. No login required.

## Parameters

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `repo` | string | yes | - | Repository as `owner/repo` (e.g. `facebook/react`) or its full URL `https://github.com/facebook/react/issues`. |
| `state` | enum | no | `open` | `open`(未关闭) \| `closed`(已关闭) \| `all`(全部). Maps to the Open/Closed tabs on the issues page. |
| `sort` | enum | no | `created` | `created`(按创建时间) \| `updated`(按更新时间) \| `comments`(按评论数). Maps to the issues page sort dropdown. |
| `limit` | number | no | `20` | Maximum issues to return (1-100). |

## Return Value

```json
{
  "repo": "string",
  "state": "string",
  "sort": "string",
  "count": "number",
  "partial": "boolean",
  "issues": [
    {
      "number": "number",
      "title": "string",
      "state": "string",
      "html_url": "string",
      "author": "string|null",
      "labels": ["string"],
      "comments": "number",
      "created_at": "string (ISO 8601)",
      "updated_at": "string (ISO 8601)"
    }
  ]
}
```

- `state` per issue is `open` or `closed` (closed includes GitHub's "Closed (completed)" and "Not planned (skipped)" — both reported as `closed`).
- `title` is plain text (HTML tags/entities stripped).
- `partial=true` when fewer than `limit` issues were returned (repo has fewer, or the list ended).
- `repo` in the output is the canonical name after GitHub redirects (e.g. `facebook/react` → `react/react`).

## Usage

```
websculpt github list-issues --repo facebook/react
websculpt github list-issues --repo facebook/react --state closed --sort updated --limit 50
websculpt github list-issues --repo https://github.com/react/react/issues --state all --sort comments --limit 100
```

## Common Error Codes

- `INVALID_PARAM` — `repo` missing/malformed, invalid `state`/`sort` value, or `limit` out of range (1-100).
- `NOT_FOUND` — the repository does not exist (GitHub page title contains "Page not found").
- `EMPTY_RESULT` — the repository exists but has no issues matching the filter (including repos with issues disabled).
- `NETWORK_ERROR` — the page's GraphQL query failed (HTTP/network/errors payload).
- `DRIFT_DETECTED` — the GraphQL response shape changed from the expected structure.
- `BROWSER_ATTACH_REQUIRED` — Chrome/Edge with remote debugging is not connected (raised by the runner).

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. No login required.
