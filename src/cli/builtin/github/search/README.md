# github/search

Search GitHub repositories, users, issues, or pull requests by keyword, from the rendered search page `https://github.com/search`.

## Description

`github/search` is GitHub's core discovery entry. Pass a keyword and pick a result tab; the command returns the top matching entries with type-specific fields (name/login/title, URL, description/bio, language, stars/followers, update/created time). It complements the `github/get-*` / `github/list-*` commands (which target a known repo/user) by adding the keyword entry point; the returned `html_url` values chain directly into `github/get-repo`, `github/get-user`, `github/get-issue`, `github/get-pull`.

## Parameters

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `query` | string | yes | - | Search keyword, e.g. `rust`.（搜索关键词，必填。） |
| `type` | enum | no | `repositories` | `repositories`(仓库) / `users`(用户) / `issues`(issue) / `pull-requests`(PR). Sent to GitHub as `pullrequests` for pull requests. |
| `sort` | enum | no | `best-match` | `best-match`(最佳匹配) / `stars`(最多 star) / `updated`(最近更新). Only effective for `repositories`. |
| `limit` | number | no | `10` | Max results (1-50). Above 10 paginates via `?p=N`. |

## Return Value

```json
{
  "query": "rust",
  "type": "repositories",
  "sort": "best-match",
  "count": 10,
  "partial": false,
  "result_count": 612516,
  "results": [
    {
      "full_name": "rust-lang/rust",
      "html_url": "https://github.com/rust-lang/rust",
      "description": "Empowering everyone to build reliable and efficient software.",
      "language": "Rust",
      "stars": 115374,
      "updated_at": "2026-08-09T08:27:14.817Z",
      "topics": ["language", "rust", "compiler"],
      "archived": false
    }
  ]
}
```

Fields vary by type:

- `repositories`: `{ full_name, html_url, description, language, stars, updated_at, topics[], archived }`
- `users`: `{ login, name, html_url, bio, location, followers, repos }`
- `issues`: `{ number, title, html_url, repo, author, state, comments, created_at, labels[] }`
- `pull-requests`: `{ number, title, html_url, repo, author, state, comments, created_at, merged, labels[] }`

`count` is the number returned (capped at `limit`); `partial` is `true` when fewer than `limit` were available (reached the end of results or the 100-page search cap). `result_count` is GitHub's total match count for the query. Description/bio/title have `<em>` highlight tags stripped.

## Usage

```
websculpt github search --query rust
websculpt github search --query rust --type repositories --sort stars --limit 10
websculpt github search --query rust --type users
websculpt github search --query rust --type issues --limit 5
websculpt github search --query "web framework" --type pull-requests --sort updated
```

## Common Error Codes

- `INVALID_PARAM` — missing/empty `query`, or invalid `type` / `sort` / `limit`.
- `EMPTY_RESULT` — the search returned zero matches.
- `BROWSER_ATTACH_REQUIRED` — Chrome/Edge remote debugging is not connected.
- `NETWORK_ERROR` — the page could not be loaded.
- `DRIFT_DETECTED` — neither the embeddedData payload nor the results-list DOM could be read.
