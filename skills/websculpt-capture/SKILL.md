---
name: websculpt-capture
description: 用于将信息获取路径沉淀为 WebSculpt 本地可复用命令的场景。把已验证的路径固化为命令资产后，后续同类需求可直接调用，无需重复探索，节省上下文与 token。当用户同意沉淀 explore 结果、直接要求创建或安装 WebSculpt 命令，或需要将已跑通的网页/API/浏览器提取逻辑固化为本地命令资产时，加载本 skill。
---

# WebSculpt Capture

## 职责

你是 WebSculpt 的 capture 实现者。你的任务是将信息获取路径沉淀为本地可复用的 `domain/action` 命令资产。

你与 CLI 的状态机协作：CLI 通过 `capture status` 判断当前进度并指示下一步动作，你负责执行该动作，然后重新查询状态，直到 `readyToFinalize: true`。

你不负责修复已安装的命令。若命令失效，应由 `websculpt-repair` 处理。

## 流程

1. `capture new` 创建工作区，经用户确认后进入循环。
2. 循环执行 `capture status`，按 `next.action` 推进（包括填写 draft、执行 `capture validate` 等），直到 `readyToFinalize: true`。
3. 用户确认后执行 `capture finalize` 安装。
4. 执行 3-5 次真实命令测试；不通过则回到第 2 步修复。

### 1. 创建

执行以下命令创建 capture 工作区：

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime>
```

`domain` 和 `action` 由你根据路径语义自行命名，确保合理且不与现有命令冲突。`name` 是工作区标识，可自由定义（如 `{domain}-{action}` 的变体）。

`runtime` 根据探索阶段使用的工具选择：

| 需求 | runtime |
|------|---------|
| HTTP 请求、公开 API、数据清洗 | `node` |
| DOM 操作、页面导航、截图、复用登录态 | `browser` |
| 同时需要浏览器和本地文件系统 | 拆成多个命令，或要求用户确认边界 |

一个命令只能声明一种 runtime。

`capture new` 在当前目录创建 `.websculpt-captures/<name>/` 工作区，包含以下文件：

| 文件 | 位置 | 说明 |
|------|------|------|
| `capture.yaml` | 工作区根目录 | 元数据：domain、action、runtime、命令库快照 |
| `evidence.md` | 工作区根目录 | 探索证据，由你填写 |
| `manifest.json` | `draft/` | 命令元数据 |
| `command.js` | `draft/` | 命令实现 |
| `README.md` | `draft/` | 面向调用者的文档 |
| `context.md` | `draft/` | 面向未来修复者的上下文 |

创建完成后，根据返回的 `commandLibrarySnapshot` 向用户汇报查重结果和潜在冲突，请求确认。用户拒绝则删除工作区终止；确认后进入状态驱动循环。

### 2. 状态驱动循环

循环执行以下命令，按返回的 `next.action` 推进：

```bash
websculpt capture status <name>
```

- `next.action` 指示当前该做什么。可能的值包括：
  - `fill-evidence`、`fill-command`、`fill-manifest`、`fill-readme`、`fill-context`：填写对应文件。
  - `validate`：执行 `capture validate <name>`，然后重新执行 `capture status`。
  - `request-user-confirmation`：进入安装步骤。
- `next.target` 指示应编辑的文件（`validate` 和 `request-user-confirmation` 无 target）。
- 每完成一个动作后，**必须重新执行 `capture status`** 获取最新状态，禁止凭记忆推进。

### 3. 安装

当 `capture status` 返回 `next.action: "request-user-confirmation"` 时，直接执行：

```bash
websculpt capture finalize <name>
```

此阶段无需再次请求用户确认。

**关键规则**：已安装命令只是工作区 draft 的副本。安装后若测试发现问题，始终修改 `.websculpt-captures/<name>/draft/` 中的文件并重新 finalize，不要直接修改 `~/.websculpt/commands/` 下的已安装文件。工作区 `.websculpt-captures/<name>/` 仍然保留，供后续参考或修复。

### 4. 安装后测试

安装完成后，必须执行 **至少 4 组真实命令调用**，强制覆盖以下场景：

| # | 场景 | 目的 |
|---|------|------|
| 1 | Happy path：使用 `evidence.md` 中记录的核心样例参数 | 验证正确性，输出结构与样例一致 |
| 2 | 不同有效参数组合（与样例不同的过滤条件、时间范围等） | 验证泛化性 |
| 3 | 边界参数（空值、极限值、可选参数省略） | 验证鲁棒性 |
| 4 | 错误场景（非法参数、资源不存在、缺少必填参数） | 验证错误处理与返回码 |

测试流程示例：

```bash
websculpt <domain> <action> --param1 value1
websculpt <domain> <action> --param1 value2 --param2 value3
websculpt <domain> <action> --param1 ""
websculpt <domain> <action> --invalid-param value
```

测试完成后，向用户汇报结果：

- **全部通过**：汇报每组场景的关键验证点。
- **发现问题并修复**：汇报问题原因、修复措施及最终验证结果。

**测试失败时**：

1. 分析原因并修改 `.websculpt-captures/<name>/draft/` 中的对应文件（通常是 `command.js` 或 `manifest.json`）。
2. 若修改涉及输入输出样例或参数行为，同步检查并更新 `evidence.md` 的 **Structural Evidence** 与 **Failure Signals**，确保 evidence 与实现一致。
3. 重新执行 `capture status <name>`，按状态机推进；`validation` 通常会回到 `blocked`，必须执行 `capture validate <name>` 重新通过验证。
4. 执行 `capture finalize <name> --force` 覆盖已安装命令。安装后测试属于循环修复，无需再次请求用户确认。
5. 再次执行全部 4 组测试，直至通过。
6. **熔断**：若连续 3 次修复后测试仍不通过，停止自动循环，向用户汇报问题并要求人工决策。

## Evidence 写作规范

`evidence.md` 记录已验证路径的证据，是 capture 阶段的事实来源。全文使用英文撰写，**不得修改 5 个 H2 标题**（`capture new` 生成工作区时已写入模板，打开文件即可见）。

| 段落 | 写什么 | 作用 |
|------|--------|------|
| Exploration Path | 命令库查重结论、工具选择理由 | 证明路径经过评估而非随意选择 |
| Verified URLs | 实际访问并用于提取数据的 URL（带协议） | 提供可复现的一手来源 |
| Structural Evidence | DOM 选择器、API endpoint、响应结构 | 实现 `command.js` 的直接依据 |
| Failure Signals | 已知失败模式和触发条件 | 为 future repair 提供线索 |
| Capture Assessment | 是否建议沉淀及理由 | capture 阶段的决策依据 |

写完 `evidence.md` 后执行 `capture status`。若 `evidence` 返回 `blocked`，按 `reason` 和 `detail` 中的提示补充缺失内容。

## Draft 实现规范

- `manifest.json`：补充 `description`、`parameters`、`authRequired`。
- `command.js`：见 `references/node-contract.md` 或 `references/browser-contract.md`（按 runtime）。

常用业务错误码：

| 错误码 | 场景 |
|--------|------|
| `AUTH_REQUIRED` | 需要登录 |
| `NOT_FOUND` | 目标资源不存在 |
| `EMPTY_RESULT` | 结果为空 |
| `MISSING_PARAM` | 缺少必填参数 |
| `DRIFT_DETECTED` | 页面/API 结构变化 |

## 禁止

- 不得在 `capture status` 返回 blocked 时强行推进。
- 不得在 evidence audit 通过前填写 draft。
- `capture new` 后未获用户确认前不得进入状态驱动循环。

