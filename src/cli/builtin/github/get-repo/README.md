# github/get-repo

Fetch a GitHub repository's full metadata by `owner/repo` or URL. Reads the rendered repository page (SSR `react-app.embeddedData` + a small hydrated-DOM read), so it is **not** subject to GitHub REST API rate limits.

## Description

Given a repository identifier (`owner/repo` or `https://github.com/owner/repo`), return: owner, About description, homepage, clone URLs (HTTPS and SSH), star/fork/watcher counts, open issues, primary language, license, topics, archived flag, default branch, created/updated/pushed dates. Pass `--include_readme true` to also return the README text.

No login required. Requires Chrome or Edge running with remote debugging enabled (WebSculpt daemon attaches to it).

## Parameters

| Name | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `repo` | string | yes | - | Repository as `owner/repo` (e.g. `facebook/react`) or its full URL `https://github.com/facebook/react`.（仓库标识：`owner/repo` 或完整 URL，如 `facebook/react`。） |
| `include_readme` | boolean | no | `false` | Set to `true` to also return the repository README text. Default false.（是否同时返回 README 全文，默认 false。） |

## Return Value

```json
{
  "full_name": "react/react",
  "description": "The library for web and native user interfaces.",
  "homepage": "https://react.dev",
  "html_url": "https://github.com/react/react",
  "owner": { "login": "react", "avatar_url": "https://avatars.githubusercontent.com/u/102812?s=60&v=4" },
  "clone_url": "https://github.com/react/react.git",
  "ssh_url": "org-XXXXXXX@github.com:react/react.git",
  "stars": 247138,
  "forks": 51203,
  "watchers": 6606,
  "open_issues": "810",
  "language": "JavaScript",
  "license": { "spdxId": "MIT", "name": "MIT License" },
  "topics": ["declarative", "frontend", "javascript", "library", "react", "ui"],
  "archived": false,
  "default_branch": "main",
  "created_at": "2013-05-24T16:15:54.000Z",
  "updated_at": "2026-08-08T02:31:46.000Z",
  "pushed_at": "2026-08-08T02:31:46.000Z",
  "readme": "React · React is a JavaScript library for building user interfaces. ..."
}
```

Notes:
- `ssh_url` is only available when the browser has an SSH key configured (account-specific, e.g. `org-XXXXXXX@github.com:...`); anonymous/not configured returns `null`.
- `updated_at` / `pushed_at` are derived from the page's `Latest commit` timestamp (the only repo-level timestamp GitHub shows on this page); `created_at` is the exact embedded value.
- `readme` is returned only when `--include_readme true`; `null` if the repository has no README.

## Usage

```
websculpt github get-repo --repo facebook/react
websculpt github get-repo --repo https://github.com/facebook/react
websculpt github get-repo --repo facebook/react --include_readme true
```

## Common Error Codes

- `INVALID_PARAM` — `repo` is missing or not a valid `owner/repo` / GitHub URL.
- `NOT_FOUND` — the repository does not exist (404).
- `EMPTY_RESULT` — page loaded but no repository metadata could be extracted.
- `DRIFT_DETECTED` — page structure changed (embedded data missing).
- `NETWORK_ERROR` — load failed, or GitHub rate-limited/blocked (HTTP 429/403).
- `BROWSER_ATTACH_REQUIRED` — no Chrome/Edge with remote debugging enabled (infrastructure; raised by the daemon).
