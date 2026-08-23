# github/list-repos

List a GitHub user's or organization's public repositories from the profile repositories tab. Works for both user profiles (`https://github.com/{user}?tab=repositories`) and organization profiles (`https://github.com/orgs/{org}/repositories`).

## Description

Returns the requested number of repository cards ordered by the chosen sort, each with `full_name`, `html_url`, `description`, `language`, `stars`, `forks`, `fork`, `archived`, and `updated_at` (ISO-8601 from the page's `relative-time` element). Pagination is automatic (`?page=N`, 30 per page) until `limit` is reached.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `user` | yes | - | GitHub username or organization name, e.g. `facebook` or `torvalds`. Full URL accepted. |
| `type` | no | `owner` | `owner`(自己创建) / `fork`(fork 的) / `member`(参与的). Note: GitHub has no native `member` filter — it falls back to all public repos. |
| `sort` | no | `stars` | `stars`(最多 star) / `updated`(最近更新) / `created`(最新创建) / `name`(名称). Note: GitHub has no native `created` sort — it falls back to recent update. |
| `limit` | no | `20` | Maximum repositories to return (1-100). |

## Return Value

```json
{ "user": "string", "type": "string", "sort": "string", "count": "number",
  "partial": "boolean",
  "repositories": [ { "full_name": "string", "html_url": "string",
    "description": "string|null", "language": "string|null", "stars": "number",
    "forks": "number", "fork": "boolean", "archived": "boolean",
    "updated_at": "string|null" } ] }
```

- `partial=true` when fewer than `limit` repos were available (e.g. the account has fewer matching repos).
- `stars`/`forks`: exact integers on user pages; abbreviated (k/m suffix) values on organization pages are parsed as approximations (e.g. `66k` → 66000).

## Usage

```
websculpt github list-repos --user facebook --type owner --sort stars --limit 20
websculpt github list-repos --user torvalds --sort updated --limit 10
websculpt github list-repos --user microsoft --type fork
```

## Common Error Codes

- `INVALID_PARAM` — invalid/empty `user`, unknown `type`/`sort` value, or `limit` outside 1-100.
- `NOT_FOUND` — the GitHub user/org does not exist (page title "Page not found").
- `EMPTY_RESULT` — the user/org exists but has no repositories matching the filter.
- `BROWSER_ATTACH_REQUIRED` — browser remote debugging not connected (daemon/infra).
- `NETWORK_ERROR` — page navigation failed.

## Prerequisites

Requires Chrome or Edge running with remote debugging enabled. No login required.
