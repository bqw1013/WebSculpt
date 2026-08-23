# techmeme/get-timeline

获取 Techmeme River 的纯倒序时间流：未经编辑排序/聚簇的全部报道，按发布时间倒序逐条列出，覆盖滚动约 6 天窗口。用于监控"最近几小时/几天发生的一切科技新闻"，是首页策展视图（`techmeme/get-feed`）之外的完整补充。River 是单页静态 HTML，无翻页；单次 HTTP 请求返回全部条目（实测 153 条，条数随发帖量浮动）。

## Description

命令直取 `https://www.techmeme.com/river`（静态 HTML，无需登录、无需浏览器），解析日期分组（H2）+ 条目行（`tr.ritem`），按发布时间倒序输出。每条包含：页面原始时间、所属日期、标题、作者（约 1/3 条目无作者，为 `null`）、来源、原文链接、Techmeme 永久链接 id。返回数组；`limit` 超出当页实有条数时返回全部并在每条标 `partial: true`。

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | no | 50 | 返回条数上限。整数，范围 **1-200**。River 为单页无翻页，当页实有条数随发帖量浮动（实测 153 条/覆盖约 6 天）；limit 超出实有条数时返回全部并在每条标 `partial: true`，非报错。 |

## Return Value

返回一个数组（Array），按发布时间倒序。每项：

```json
{
  "time": "1:15 AM",
  "date": "August 18, 2026",
  "title": "OpenAI says ... increase compute overhead by 20% ...",
  "author": "Thomas Claburn",
  "source": "The Register",
  "url": "https://www.theregister.com/ai-and-ml/...",
  "permalink": "260818p46"
}
```

字段说明：

- `time` — 页面原始时间文本（12 小时制，含 AM/PM），如 `"1:15 AM"`；与 `date` 拼成完整时间戳。
- `date` — 条目所属日期分组（页面 H2），如 `"August 18, 2026"`。
- `title` — 标题（Techmeme 编辑摘要式标题）。
- `author` — 作者名；实测约 34% 条目无作者 → `null`。
- `source` — 来源名，如 `Reuters` / `Wall Street Journal` / `The Verge`。
- `url` — 原文链接。
- `permalink` — Techmeme 故事簇永久链接 id（rshr div 的 `pml`），如 `260818p46`，可拼 `https://www.techmeme.com/260818/p46` 交 `techmeme/get-story`。
- `partial` — 仅在 `limit` 超过当页实有条数时出现且为 `true`（此时数组为当页全部条目）。

## Usage

```
websculpt techmeme get-timeline
websculpt techmeme get-timeline --limit 20
websculpt techmeme get-timeline --limit 200
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_PARAM` | `limit` 不是非负整数，或超出范围 1-200。 |
| `MISSING_PARAM` | `limit` 缺失（正常情况下由默认值 50 填充，几乎不会触发）。 |
| `NETWORK_ERROR` | 网络失败：fetch 拒绝/超时/DNS/连接中断。 |
| `RATE_LIMITED` | Techmeme 返回 429/403（已实测不限速，防御性保留）。 |
| `NOT_FOUND` | River 页面返回 404。 |
| `API_ERROR` | 页面返回其他非 200 状态。 |
| `DRIFT_DETECTED` | 200 页面解析不到任何 `tr.ritem` 行，页面结构已变化。 |

## Notes

- 每次请求前随机 sleep 200-700ms（项目请求 pacing 硬性要求；Techmeme 实测 58 请求 0 限速）。
- 无需登录、无需浏览器、无 API key。
- 单次调用仅 1 次 HTTP 请求。
