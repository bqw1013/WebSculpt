# vimeo/search

Search Vimeo — equivalent to the search box at the top of every page (vimeo.com/search?q=...). Five result types matching the on-page tabs: video (default), ondemand, people, channel, group. Public search, no login or browser required.

## Description

Runs directly against `api.vimeo.com/search` using an anonymous JWT pulled from `vimeo.com/watch`. Supports real sort and upload-time filtering mapped to the on-page Relevance dropdown and Filters panel. Paginates internally up to the requested limit (max 100).

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `query` | string | — | Search keywords, e.g. "short film". Same as the on-site search box. (required) |
| `type` | enum | `video` | `video` / `ondemand` / `people` / `channel` / `group` |
| `limit` | int | `20` | Maximum results to return (1-100) |
| `sort` | enum | `relevance` | Sort order; valid values depend on `type` (see below) |
| `time` | enum | `all` | Upload-time filter; `video` type only |

### sort values per type

- All types: `relevance` (Relevance 相关性), `popular` (Most popular 最热门)
- video / ondemand: `latest` (Recently uploaded 最近上传), `title_asc` / `title_desc` (Title A-Z / Z-A 标题), `longest` / `shortest` (时长最长 / 最短)
- channel / group: `latest`, `name_asc` / `name_desc` (Name A-Z / Z-A 名称)
- people: `name_asc` / `name_desc`

Invalid `type` + `sort` combinations are rejected with `INVALID_PARAM` (they would otherwise return HTTP 400 from the API).

### time values

- `all` (全部), `day` (Last 24 hours 最近24小时), `week` (Last 7 days 最近7天), `month` (Last 30 days 最近30天), `year` (Last 365 days 最近365天)
- `time` only applies to `type=video`; other types only accept `all`.

## Return Value

```json
{
  "query": "short film",
  "type": "video",
  "sort": "popular",
  "time": "year",
  "maxLimit": 100,
  "total": 12345,
  "resultCount": 1,
  "pagesFetched": 1,
  "results": [
    {
      "kind": "video",
      "id": "0000001",
      "title": "Example Title",
      "name": "Example Title",
      "url": "https://vimeo.com/0000001",
      "native": { "name": "Example Title", "user": {"name": "example-user"}, "stats": {"plays": 12345}, "duration": 123 }
    }
  ],
  "source": "api",
  "fallbackUsed": false,
  "nativeEnvelope": { "total": 12345, "page": 1, "perPage": 24, "paging": null, "facets": null, "parameters": null }
}
```

## Usage

```
websculpt vimeo search --query "short film"
websculpt vimeo search --query "short film" --type video --sort popular --time year --limit 20
websculpt vimeo search --query "documentary" --type channel --sort name_asc --limit 10
websculpt vimeo search --query "short film" --type people --sort popular
```

## Common Error Codes

- `MISSING_PARAM` — `query` is required
- `INVALID_PARAM` — invalid `type` / `limit` / `sort` / `time`, or a `type`+`sort` combination the API rejects
- `LIMIT_EXCEEDED` — `limit` above 100
- `JWT_FETCH_FAILED` — could not obtain an anonymous JWT from vimeo.com
- `AUTH_REQUIRED` — API returned 401 even after refreshing the JWT
- `API_ERROR` — `api.vimeo.com/search` returned a non-200 status
- `API_TIMEOUT` — request timed out after retry
- `DRIFT_DETECTED` — API response schema changed (not JSON / missing data array)
- `EMPTY_RESULT` — no records found
