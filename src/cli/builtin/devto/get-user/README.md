# devto/get-user

获取 DEV.to 上指定用户的公开 profile 信息。

## Description

命令优先调用 Forem API；当 API 返回 429、5xx 或请求失败时，会自动 fallback 到浏览器访问 `https://dev.to/{username}` 提取信息。浏览器分支会加入随机延迟、小幅滚动和鼠标移动等常规交互行为，但 API 成功路径不会引入这些延迟。

## Parameters

- `username`（必填）：DEV.to 用户名，对应 `https://dev.to/{username}` 路径段。
  - 格式：2–30 个字符，仅允许字母、数字、下划线、连字符。

## Return Value

成功时返回一个对象，顶层始终包含 `source`，取值 `api` 或 `browser`。

```json
{
  "source": "api",
  "type_of": "user",
  "id": 1,
  "username": "{username}",
  "name": "...",
  "summary": "...",
  "twitter_username": "...",
  "github_username": "...",
  "email": null,
  "location": "...",
  "website_url": "...",
  "joined_at": "2015-12-27T04:02:17Z",
  "profile_image": "https://...",
  "badge_ids": [1, 2, 3]
}
```

字段说明：

- `id`：用户数字 ID。浏览器 fallback 时从页面按钮的 `data-info` 解析，可能为 `null`。
- `joined_at`：统一输出 ISO-8601 UTC 格式。
- `email`：公开 API 通常返回 `null`；若用户主页公开邮箱，浏览器 fallback 可能取到值。
- `badge_ids`：仅 API 路径返回；浏览器 fallback 返回空数组 `[]`。
- `null` / `undefined` 字段会被省略。

## Usage

```bash
websculpt devto get-user --username {username}
```

## Common Error Codes

- `INVALID_PARAM`：缺少 `username` 或格式不正确。
- `NOT_FOUND`：用户不存在（API 404 或页面 404）。
- `EMPTY_RESULT`：响应结构异常或页面没有可用数据。
- `RATE_LIMITED`：API 返回 429 且浏览器 fallback 也失败。
- `NETWORK_ERROR`：网络或页面加载失败，且 fallback 不可用。
- `BROWSER_ATTACH_REQUIRED`：当前没有可用的浏览器远程调试会话（由 runner 返回）。
