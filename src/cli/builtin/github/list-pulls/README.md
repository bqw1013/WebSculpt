# github/list-pulls

List a GitHub repository's pull requests (open / closed / merged / all, with created / updated / comments sorting).

## Description

Reads the rendered Pull Requests page (`https://github.com/<owner>/<repo>/pulls`) in the browser and returns PR cards with number, title, state, author, labels, comment count, review decision (Review required / Approved / Changes requested), draft flag, and state-specific timestamps. The page renders 25 PRs per page; higher `limit` values paginate via `?page=N` and `partial` reports whether the result was truncated. Repo renames (e.g. `facebook/react` → `react/react`) are followed via redirect and the effective repo is echoed back.

## Parameters

- `repo` (required): Repository as `owner/repo` (e.g. `facebook/react`) or its full URL (e.g. `https://github.com/facebook/react`). （仓库标识：owner/repo 或完整 URL）
- `state` (enum, default `open`): `open`(未关闭) | `closed`(已关闭) | `merged`(已合并) | `all`(全部). Note: `closed` maps to GitHub's Closed tab, which includes both unmerged-closed and merged PRs; each item's `state` field distinguishes them. `open` includes draft PRs. （PR 状态过滤）
- `sort` (enum, default `created`): `created`(按创建时间) | `updated`(按更新时间) | `comments`(按评论数). Maps to the page sort dropdown: Newest / Recently updated / Most commented. （排序方式）
- `limit` (number, default 20, range 1-100): Maximum pull requests to return. The first page renders 25; higher limits paginate. （条数上限）

## Return Value

```json
{
  "repo": "string",
  "state": "string",
  "sort": "string",
  "count": "number",
  "partial": "boolean",
  "pulls": [
    {
      "number": "number",
      "title": "string",
      "state": "string",
      "html_url": "string",
      "author": "string",
      "labels": ["string"],
      "draft": "boolean",
      "comments": "number",
      "review_decision": "string|null",
      "created_at": "string|null",
      "closed_at": "string|null",
      "merged_at": "string|null"
    }
  ]
}
```

- `repo` / `state` / `sort`: effective values echoed back (repo follows redirects).
- `count`: number of pull requests returned.
- `partial`: `true` when the result was truncated by `limit` (more PRs exist); `false` when the list was fully fetched.
- `pulls[].state`: `open` | `closed` | `merged` (draft PRs report `open` with `draft: true`).
- `pulls[].comments`: comment count (0 when none; the page hides the element for 0-comment PRs).
- `pulls[].review_decision`: `Review required` | `Approved` | `Changes requested` | `Draft` (for draft PRs) | `null` (from the page's review/merge-status badge; draft PRs render "Draft" in this slot).
- Timestamps are state-specific: `created_at` for open/draft (the "opened" date), `closed_at` for closed, `merged_at` for merged. Only the relevant field is populated.

## Usage

```
websculpt github list-pulls --repo facebook/react
websculpt github list-pulls --repo facebook/react --state merged --sort updated --limit 50
websculpt github list-pulls --repo "https://github.com/react/react" --state all --limit 100
```

Example output (react/react, `--state open --sort created --limit 2`):

```json
{
  "repo": "react/react",
  "state": "open",
  "sort": "created",
  "count": 2,
  "partial": true,
  "pulls": [
    {
      "number": 37251,
      "title": "Fix Fragment ref event listener registry identity",
      "state": "open",
      "html_url": "https://github.com/react/react/pull/37251",
      "author": "teamleaderleo",
      "labels": ["CLA Signed"],
      "draft": false,
      "comments": 0,
      "review_decision": "Review required",
      "created_at": "2026-08-08T22:15:43Z"
    },
    {
      "number": 37249,
      "title": "React: Add DEV guard validation for useMemoCache size argument",
      "state": "open",
      "html_url": "https://github.com/react/react/pull/37249",
      "author": "spellsaif",
      "labels": ["CLA Signed"],
      "draft": false,
      "comments": 0,
      "review_decision": "Review required",
      "created_at": "2026-08-08T10:53:18Z"
    }
  ]
}
```

## Common Error Codes

- `INVALID_PARAM`: invalid `repo` format, `state`/`sort` not in enum, or `limit` out of range (1-100).
- `NOT_FOUND`: repository does not exist (page title "Page not found" or missing repo content container).
- `EMPTY_RESULT`: request succeeded but no pull requests matched the filter.
- `DRIFT_DETECTED`: the pulls page structure changed and the list markup was not found.
- `BROWSER_ATTACH_REQUIRED`: browser is not connected (ensure Chrome/Edge remote debugging is enabled).
- `NETWORK_ERROR`: network or page-load failure.

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled (`chrome://inspect/#remote-debugging`). No login required (public data).
