# substack/get-publication

获取指定 Substack 出版物主页的文章列表。

## Description

命令会导航到 `https://{publication}.substack.com/`，在浏览器上下文中调用公开 API `homepage_data`，返回该出版物的最新或热门文章列表，以及出版物名称、描述、作者等元信息。

## Parameters

- `publication`（必填，string）：出版物子域名，如 `bettermarkets`。
- `--tab`（可选，string，默认 `latest`）：
  - `latest`：按发布时间排序。
  - `top`：按热门程度排序。

## Return Value

```json
{
  "publication": {
    "name": "string",
    "description": "string",
    "url": "string",
    "author": "string | null"
  },
  "tab": "latest | top",
  "posts": [
    {
      "id": "number",
      "title": "string",
      "subtitle": "string",
      "url": "string",
      "published_at": "string (ISO 8601)",
      "slug": "string"
    }
  ]
}
```

## Usage

```bash
websculpt substack get-publication --publication bettermarkets
websculpt substack get-publication --publication bettermarkets --tab top
websculpt substack get-publication --publication bettermarkets --tab latest
```

## Common Error Codes

- `MISSING_PARAM`：缺少 `publication` 参数。
- `INVALID_PARAM`：`publication` 格式非法，或 `--tab` 不是 `latest`/`top`。
- `NOT_FOUND`：出版物不存在（页面 404 或 API 404）。
- `API_ERROR`：API 请求或解析失败。
- `DRIFT_DETECTED`：API 返回结构变化，缺少预期的 `newPosts` / `topPosts` 字段。
