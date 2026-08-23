# techmeme/get-story

获取单个 Techmeme 故事簇的完整详情：主报道 + 相关报道 + 各平台社媒讨论 + Techmeme 官号帖子。

## Description

输入一个故事簇永久链接（`https://www.techmeme.com/{yymmdd}/p<N>`，如 `https://www.techmeme.com/260818/p29`），返回该故事簇的完整聚合视图：
主报道标题/摘要/作者/来源/原文链接/配图，More: 相关报道列表，X/LinkedIn/Bluesky/Mastodon/Forums 讨论链接，以及 Techmeme 官号在各平台的帖子。

与 `techmeme get-feed` / `get-timeline` / `search` 链式使用：它们的 `permalink` 输出是本命令的 `--url` 输入。

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--url` | string | 是 | 故事簇永久链接，形如 `https://www.techmeme.com/260818/p29`。必须是 `www.techmeme.com` 域名、`{yymmdd}`（6 位日期）与 `p<N>`（故事 id）。 |

## Return Value

```json
{
  "title": "主标题",
  "summary": "编辑摘要（去除结尾省略号）",
  "author": "主报道作者（无作者时为 null）",
  "source": { "name": "来源名", "url": "来源主页" },
  "url": "主报道原文链接",
  "permalink": "规范簇永久链接（别名 id 回填为规范 id）",
  "image": "配图绝对 URL（可能为 null）",
  "date": "YYYY-MM-DD（从 URL 的 yymmdd 段派生，页面无时刻时间戳）",
  "related": [ { "author": "相关报道作者|null", "source": "来源名", "source_url": "来源主页", "title": "文章标题", "url": "文章链接" } ],
  "discussions": {
    "x": [ { "handle": "X 账号", "url": "帖子链接" } ],
    "linkedin": [ ... ],
    "bluesky": [ ... ],
    "mastodon": [ ... ],
    "forums": [ ... ]
  },
  "social_posts": { "x": "X 帖", "mastodon": "Mastodon 帖", "bluesky": "Bluesky 帖", "threads": "Threads 帖" }
}
```

- `discussions` 各键恒存在，缺失分组为空数组。
- `social_posts` 为 Techmeme 官号帖子 URL，缺失时为空字符串。
- 别名簇（URL 的 `p<N>` 指向其他簇）时 `permalink` 回填为规范簇 id。

## Usage

```bash
websculpt techmeme get-story --url https://www.techmeme.com/260818/p29
```

## Common Error Codes

| 错误码 | 含义 |
|--------|------|
| `MISSING_PARAM` | 缺少必填参数 `--url` |
| `INVALID_PARAM` | `--url` 不匹配 `https://www.techmeme.com/{yymmdd}/p<N>` 格式 |
| `NOT_FOUND` | 日期无效或故事 id 不存在（HTTP 404），或快照页无该簇 |
| `RATE_LIMITED` | 触发 Techmeme 限流（HTTP 429/403） |
| `API_ERROR` | 页面结构异常或非预期 HTTP 状态 |
| `NETWORK_ERROR` | 网络不可达或请求超时 |
