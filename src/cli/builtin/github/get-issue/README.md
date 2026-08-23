# github/get-issue

Fetch a single GitHub issue's full detail by `owner/repo` + issue `number`. Reads the rendered issue page (hydrated DOM `data-testid` anchors; the page has no issue data in SSR embedded data), so it is **not** subject to GitHub REST API rate limits.

## Description

Given a repository identifier (`owner/repo` or `https://github.com/owner/repo`) and an issue `number`, return: number, title, state, author, full body text, labels, assignees, milestone, comment count, created/closed dates. Pass `--include_comments true` to also return the full comment thread (author/body/created_at). Comments do not lazy-load on scroll; the timeline paginates via `?timeline_page=N` (URL), which the command follows and dedups by comment id for very long threads.

No login required. Requires Chrome or Edge running with remote debugging enabled (WebSculpt daemon attaches to it).

## Parameters

| Name | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `repo` | string | yes | - | Repository as `owner/repo` (e.g. `facebook/react`) or its full URL `https://github.com/facebook/react`.（仓库标识：`owner/repo` 或完整 URL，如 `facebook/react`。） |
| `number` | number | yes | - | Issue number, e.g. `123` in `https://github.com/facebook/react/issues/123`.（issue 编号，即该 URL 中 `/issues/` 后的数字。） |
| `include_comments` | boolean | no | `false` | Set to `true` to also return the issue's comments. Default false. Comments may load via timeline pagination, so enabling this makes the command slower.（是否同时抓评论，默认 false；评论需分页加载，开启会变慢。） |

## Return Value

```json
{
  "number": 11972,
  "title": "Consider removing mouseenter/mouseleave polyfill",
  "state": "Open",
  "html_url": "https://github.com/react/react/issues/11972",
  "author": "gaearon",
  "body": "As suggested in #10247.\nNot sure we want to do it, but I decided to create an issue to track future attempts (the PR is ...",
  "labels": ["Component: DOM", "React Core Team", "Type: Breaking Change"],
  "assignees": [],
  "milestone": "19.0.0",
  "comments_count": 5,
  "created_at": "2018-01-05T16:00:10.000Z",
  "closed_at": null,
  "comments": [
    { "author": "gaearon", "body": "Also related: #10269", "created_at": "2018-01-05T16:01:53.000Z" },
    { "author": "jquense", "body": "The main difficulty with removing the polyfill is the portal support. ...", "created_at": "2018-01-05T16:14:40.000Z" }
  ]
}
```

Notes:
- `comments` is returned only when `--include_comments true`.
- `comments_count` is the number of comments loaded. For ordinary issues the initial page already contains all comments, so the count is exact even without `--include_comments`. For issues with very long timelines (more than ~30 timeline items), the initial page shows only the oldest/newest windows; `--include_comments true` paginates the timeline (`?timeline_page=N`) and dedups by comment id to return the full thread and the exact count. Without `--include_comments`, `comments_count` on such extreme issues reflects only the initially-visible comments.
- `closed_at` is read from the "X closed this" timeline event; `null` for open issues. For a closed issue with a very long timeline the event may only be reachable via pagination (`--include_comments true` covers this).
- `html_url` uses the canonical owner/repo after GitHub redirects (e.g. `facebook/react` -> `react/react`).

## Usage

```
websculpt github get-issue --repo react/react --number 11972
websculpt github get-issue --repo react/react --number 11972 --include_comments true
websculpt github get-issue --repo https://github.com/facebook/react --number 11972
```

## Common Error Codes

- `INVALID_PARAM` — `repo` is missing/not a valid `owner/repo` / GitHub URL, or `number` is not a positive integer.
- `NOT_FOUND` — the repository or issue does not exist (404); or the number belongs to a Pull Request (GitHub redirects `/issues/{n}` to `/pull/{n}`), which should be fetched with `github/get-pull`.
- `EMPTY_RESULT` — page loaded but no issue data could be extracted.
- `DRIFT_DETECTED` — page structure changed (expected issue-body selector not found).
- `NETWORK_ERROR` — load failed, or GitHub rate-limited/blocked (HTTP 429/403).
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging enabled (infrastructure; raised by the daemon).
