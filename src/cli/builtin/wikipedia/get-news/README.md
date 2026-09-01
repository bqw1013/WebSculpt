# wikipedia/get-news

获取指定语言版本 Wikipedia「新闻动态」页面中的近期大事列表，每条新闻附带相关的维基条目链接。适合作为日报、内容分析或新闻背景资料源。

## Description

`wikipedia/get-news` 通过 MediaWiki Action API 读取各语言手工维护的新闻门户页，解析渲染后的 HTML，返回按时间倒序排列的新闻条目。数据完全公开，无需登录。

## Parameters

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `limit` | number | 否 | 20 | 返回新闻条数，范围 1–100 |
| `language` | string | 否 | zh | 语言版本代码，如 `zh`、`en`、`ja`、`ko`、`fr`、`de`、`es`、`ru` 等 |

## Return Value

```json
{
  "language": "zh",
  "generated_at": "2026-08-30T12:00:00Z",
  "source_url": "https://zh.wikipedia.org/wiki/Portal:<页面名>",
  "count": 20,
  "items": [
    {
      "date": "8月30日",
      "text": "<事件描述文本，已脱敏示例>",
      "links": [
        { "title": "<条目标题>", "url": "https://zh.wikipedia.org/wiki/<条目标题>" }
      ]
    }
  ]
}
```

- `date` 语言相关：zh/ja 等存在日期分组；en 页面无日期分组，因此省略该字段。
- `links` 仅保留 `/wiki/` 条目链接，过滤引用锚点与特殊页面。
- 输出中省略 `null` / `undefined` 字段。

## Usage

```bash
# 默认中文，返回 20 条
websculpt wikipedia get-news

# 英文新闻
websculpt wikipedia get-news --language en

# 日文新闻，限制 10 条
websculpt wikipedia get-news --language ja --limit 10
```

## Common Error Codes

- `INVALID_PARAM`：`limit` 不是 1–100 的整数，或参数格式非法。
- `NOT_FOUND`：对应语言的新闻门户页不存在。
- `EMPTY_RESULT`：语言未映射到新闻门户页，或页面中无法提取到新闻条目。
- `NETWORK_ERROR`：无法访问 Wikipedia API（常见于网络出口受限或出口路径未生效）。
- `RATE_LIMITED`：防御性保留，当前 Wikipedia 公开 API 无硬性配额，但异常高频时可能触发。

## Prerequisites

- 可访问 `wikipedia.org`（部分网络环境需要合适的出口路径）。
- 无需 API Key，无需登录。
