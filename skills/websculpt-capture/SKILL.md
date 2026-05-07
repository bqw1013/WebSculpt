---
name: websculpt-capture
description: WebSculpt Capture 工作流。用于在 websculpt-explore 已完成信息获取并输出 Capture Assessment 后，评估已验证路径是否值得沉淀、查重、向用户提交 Capture Proposal Card、创建 capture 工作区并编写 evidence.md；不负责重新探索网页、不负责编写 command.js、README.md、context.md，也不负责 validate、finalize 或安装命令。
---

# WebSculpt Capture

> 加载本 skill 后，必须先确认已有来自 `websculpt-explore` 的 Capture Assessment 或等价探索证据。没有已验证路径时，不得创建 capture。

## 角色

你是 WebSculpt 的 capture 负责人。你的任务是把一次已经跑通的信息获取路径整理成可交给 `websculpt-compile` 的证据包。

Capture 不等于编写命令。Capture 只回答：

- 这条路径是否真的值得沉淀？
- 是否已有命令覆盖？
- 用户是否确认 domain、action、runtime 和价值判断？
- `evidence.md` 是否足够支撑后续实现？

## 边界

本 skill 负责：

- 读取并复核 Capture Assessment。
- 判断路径是否已验证、可参数化、粒度合适。
- 查重 WebSculpt 命令库。
- 向用户提交 Capture Proposal Card，并等待明确确认。
- 创建 capture 工作区。
- 根据已验证路径编写 `evidence.md`。
- 完成后提示进入 `websculpt-compile`。

本 skill 不负责：

- 重新探索网页、API 或浏览器路径。
- 捕获未实际跑通的理论方案。
- 编写 `draft/command.js`。
- 编写 `draft/README.md` 或 `draft/context.md`。
- 运行 `capture validate`、`capture finalize` 或 `command create`。
- 修复已安装命令。

## 启动协议

1. 检查用户或上一步是否提供 Capture Assessment。
2. 若证据不足，要求回到 `websculpt-explore` 补足探索证据。
3. 复核候选路径是否满足 capture 条件。
4. 对候选路径执行命令库查重。
5. 向用户提交 Capture Proposal Card。
6. 获得用户明确确认后，创建 capture 工作区。
7. 根据已验证路径编写 `evidence.md`。

## Capture 条件

建议 capture 的路径必须同时满足：

- **实际跑通**：本次探索已经成功获取目标信息。
- **可参数化**：换参数后仍有明确复用价值。
- **粒度小**：覆盖一个清晰子任务，而不是混合多个站点、多个目标或大工作流。
- **来源稳定**：URL、API、DOM 结构或数据字段有可记录的稳定依据。
- **证据充分**：能提供样例输入、样例输出和关键路径。
- **风险可描述**：登录、反爬、限流、失效条件可以被明确记录。
- **未被覆盖**：命令库中不存在已覆盖当前能力的命令。

以下情况不应创建 capture：

- 只是一次性问答，没有稳定复用路径。
- 只读了搜索摘要，没有验证一手来源。
- 路径没有实际跑通，只是推测可行。
- 任务主要依赖人工判断，自动化价值低。
- 目标需要高风险账号操作，且用户未明确接受风险。
- 需要多个独立站点或 API 才能完成，无法拆成小命令。
- 命令库已有等价能力。

## 查重

在创建 capture 前，必须检查命令库：

```bash
websculpt command list
```

发现可能重叠的命令后，继续查看：

```bash
websculpt command show <domain> <action>
websculpt command show <domain> <action> --include-readme
```

若已有命令覆盖当前路径，不创建新 capture。若已有命令只覆盖一部分，说明差异并让用户决定是否继续。

`domain` 应表示目标服务、站点或数据源，例如 `github`、`reddit`、`hackernews`。`action` 应表示一个具体操作，例如 `list-trending`、`search-posts`、`fetch-profile`。不要使用 `research`、`analyze`、`scrape-all` 这类过大的 action。

## 用户确认

没有用户明确确认，不得创建 capture 工作区，也不得写 `evidence.md`。

确认前必须展示 Capture Proposal Card。若存在多个候选路径，应逐一列出，让用户选择全部、部分或暂不 capture。

Proposal Card 必须包含：

| 字段 | 说明 |
|------|------|
| `name` | capture 工作区名称，建议由 domain 和 action 组成 |
| `domain` / `action` | 目标命令名称 |
| `runtime` | 目标运行时，通常为 `node` 或 `browser` |
| `description` | 一句话说明命令用途 |
| `ioExamples` | 至少一组输入参数和预期输出摘要 |
| `valueAssessment` | 为什么值得 capture |
| `stabilityAssessment` | 来源、接口或页面结构的稳定性判断 |
| `antiCrawlAssessment` | 反爬、限流或账号风险 |
| `authRequired` | `required`、`not-required` 或 `unknown` |
| `expectedFailures` | 预期失败条件和表现 |
| `dedupeResult` | 命令库查重结果 |

推荐格式：

```text
Capture Proposal Card: <name>

- domain/action: <domain>/<action>
- runtime: <node|browser>
- description: <一句话说明>
- ioExamples:
  - input: { ... }
  - output: { ... }
- valueAssessment: <复用价值>
- stabilityAssessment: <稳定性判断>
- antiCrawlAssessment: <风险和规避方式>
- authRequired: <required|not-required|unknown>
- expectedFailures:
  - <失败条件>: <预期表现>
- dedupeResult: <无重叠|部分重叠|已覆盖>
```

Proposal Card 是给用户看的决策卡。后续 `websculpt-compile` 会根据 `evidence.md` 将其中信息映射到 `manifest.json`、`README.md` 和 `context.md`，但本 skill 不编写这些命令资产。

## Capture CLI

当 Capture CLI 可用时，按以下流程执行：

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime>
websculpt capture status <name>
websculpt capture instructions evidence <name>
```

然后根据 instructions 写入：

```text
.websculpt-captures/<name>/evidence.md
```

当 Capture CLI 尚未实现或当前环境不可用时，不要假装命令已执行。只输出确认后的 Proposal Card 和可写入 `evidence.md` 的内容草案，并明确说明需要等 Capture CLI 可用后再落盘。

## Evidence Contract

`evidence.md` 是给 `websculpt-compile` 的输入。它必须记录已验证事实，不写未验证设计。

内容原则：

- 只记录本次探索实际验证过的信息。
- 不编写未验证 endpoint。
- 不编写未验证 selector。
- 不编写理论参数。
- 不把用户未确认的命名或风险判断写成事实。
- 不把 command 实现代码写进 evidence。

推荐结构：

````markdown
# Evidence: <name>

## Capture Target

- name:
- domain:
- action:
- runtime:
- description:

## Verified Sources

- URL / API:
- Access method:
- Auth state:

## Verified Inputs

| Parameter | Example | Notes |
|-----------|---------|-------|
|           |         |       |

## Verified Output

```json
{
}
```

## Retrieval Path

1. ...
2. ...
3. ...

## Stable Selectors or Fields

- ...

## Failed Paths

- ...

## Environment Dependencies

- Login:
- Rate limit:
- Anti-crawl:
- Browser/session:

## Failure Signals

- ...

## Notes for Compile

- ...
````

一个 `evidence.md` 只描述一个命令候选。如果探索过程中访问了多个独立站点或 API，应拆成多个 capture。

## 完成条件

一次 capture 完成时，应具备：

- 已确认的 `name`、`domain`、`action`、`runtime`。
- 已完成查重，并记录是否存在重叠命令。
- 用户已确认 Capture Proposal Card。
- `evidence.md` 只包含本次实际验证过的信息。
- 下一步明确交给 `websculpt-compile`。
