---
name: websculpt-capture
description: 用于将信息获取路径沉淀为 WebSculpt 本地可复用命令的场景。把已验证的路径固化为命令资产后，后续同类需求可直接调用，无需重复探索，节省上下文与 token。本 skill 仅在经过 explore 阶段验证路径后加载。当用户同意沉淀 explore 结果，或需要将已跑通的网页/API/浏览器提取逻辑固化为本地命令资产时加载。若路径尚未经过 explore 验证，必须先加载 websculpt-explore 完成探索。
---

# WebSculpt Capture

## 职责

你是 WebSculpt 的 capture 实现者，负责将已验证的信息获取路径转化为本地可复用、可执行的 `domain/action` 命令资产。

你对命令的**设计质量、实现正确性和交付可用性**负全责。CLI 状态机通过 `capture status` 检查各 artifact 的完成进度，你负责推进状态并确保内容正确，安装前必须通过真实调用验证命令可用。

**探索先决条件**：capture 必须建立在已验证路径之上。如果当前路径尚未经过 explore 阶段验证（无 `trace.md` 审计完成记录），你必须先加载 `websculpt-explore` 完成探索，填写 `trace.md` 并执行 `explore assess <name>` 通过审计后，再将 `exploreVerified` 设为 `true`，然后进入 capture。

交付后因目标页面或 API 变化导致的失效，由 `websculpt-repair` 处理，不属于 capture 职责。

## CaptureSession（强制）

进入 capture 阶段后，**不再维护 ExploreSession 和 BrowserSession**，只输出 CaptureSession。每次回复的**结尾**必须输出当前 CaptureSession 状态块。格式如下：

```yaml
CaptureSession:
  exploreVerified: false
  userIntentConfirmed: false
  contractRead: false
  testScenarios: []
  testResults: []
  repairCount: 0
  repairStep: null
```

### 状态规则

- `exploreVerified` 为 `false` 时，**禁止**执行 `capture new`。必须先确认路径已经过 explore 验证（`explore assess` 返回 `status: passed`）；若未验证，必须先加载 `websculpt-explore` 完成探索、填写 `trace.md` 并通过审计。
- `userIntentConfirmed` 为 `false` 时，**禁止**执行 `capture new`。必须完成前置确认并获用户明确同意后，方可设为 `true`。且**展示契约的回复中禁止调用任何工具或执行任何 `capture` 子命令**，必须等待用户下一条回复。
- `contractRead` 为 `false` 时，**禁止**编辑或修改 `draft/command.js`。必须先阅读对应 runtime 的 contract 文档并设为 `true`。
- `testScenarios` 为空时，**禁止**执行 `capture finalize`。finalize 前必须列出 4 组测试的具体命令，覆盖 happy path、泛化参数、边界参数、错误场景。
- `testResults` 长度 < 4 时，**禁止**汇报"测试通过"或"测试完成"。
- 修复循环中，`repairStep` 必须按顺序推进，禁止跳步：
  1. `null` → 修改 draft 文件 → `modify`
  2. `modify` → 执行 `capture status` → `status1`
  3. `status1` → 执行 `capture validate` → `validate`
  4. `validate` → 执行 `capture status` → `status2`
  5. `status2` → 执行 `capture finalize --force` → `finalize`
  6. `finalize` → 重置为 `null`，`repairCount += 1`，重新执行全部 4 组测试
- `repairCount >= 3` 时，**必须**停止自动循环，向用户汇报问题并交由用户决策。

### 更新时机

- 确认路径已通过 explore 验证后（`explore assess` 返回 passed）：`exploreVerified` 设为 `true`
- 前置确认完成、用户明确同意后：`userIntentConfirmed` 设为 `true`
- 阅读对应 runtime 的 contract 文档后：`contractRead` 设为 `true`
- finalize 前：设计 4 组测试命令，写入 `testScenarios`
- 每组测试执行后：记录结果到 `testResults`
- 进入修复循环时：`repairCount += 1`，`repairStep` 设为 `modify`
- 每完成一个修复动作：按顺序更新 `repairStep`
- 修复完成（`finalize --force` 后）：`repairStep` 重置为 `null`

## 流程

1. **前置确认**：向用户展示命令契约（场景、输出、参数、命名、运行时、冲突），获得明确同意后设置 `userIntentConfirmed: true`。**展示契约的回复中禁止调用任何工具或执行任何 `capture` 子命令**，必须等待用户下一条回复。
2. `capture new` 创建工作区，然后直接进入状态驱动循环。
3. 反复执行 `capture status`，按 artifact 状态推进（填写 evidence 和 draft 文件，执行 `capture validate`），直到所有 artifact 均为 `done`。
4. 执行 `capture finalize` 安装为可执行命令。
5. 执行至少 4 组真实命令测试；不通过则进入修复循环。

### 0. 前置确认（必须在 `capture new` 之前）

执行 `capture new` 前，必须逐项向用户展示命令契约并获得明确同意。用户提出修改时，调整方案后重新展示，直到用户明确同意。

**关键规则**：
- **展示契约的回复中禁止调用任何工具或执行任何 `capture` 子命令**。你的唯一职责是展示契约并输出 `CaptureSession`。
- 只有在用户明确回复同意后，才能在**下一轮对话**中将 `userIntentConfirmed` 设为 `true` 并执行 `capture new`。

| 确认项 | 展示内容 | 为什么必须在 new 之前 |
|--------|----------|---------------------|
| 场景 | 命令解决什么问题、什么情况下复用 | 确保用户理解价值 |
| 输出数据 | 字段列表及示例 JSON 片段 | 避免输出不符合预期导致返工 |
| 输入参数 | 名称、必填性、默认值、支持范围 | 避免参数设计遗漏导致重新改 draft |
| 运行时 | `node`/`browser`/`shell`/`python` 及理由 | 影响环境依赖和执行方式 |
| 命名 | 提议的 `domain/action` | 用户可能有命名偏好 |
| 现有命令关系 | 同名/类似命令，是否覆盖 builtin/user | 避免意外覆盖 |
| 前置条件与限制 | 是否需要登录、已知边界、不支持的功能 | 管理用户预期 |

用户明确同意后的**下一轮对话**中，将 `CaptureSession.userIntentConfirmed` 设为 `true`，然后执行 `capture new`。

### 1. 创建

执行以下命令创建 capture 工作区：

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime>
```

`domain` 用名词，`action` 用动词，根据路径语义自行命名，确保不与现有命令冲突。`name` 是工作区标识，可自由定义（如 `{domain}-{action}` 的变体）。

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
| `capture.yaml` | 工作区根目录 | 工作区身份锚点，domain/action/runtime 创建后固定，后续 draft 必须与之保持一致 |
| `evidence.md` | 工作区根目录 | 探索证据，由你填写 |
| `manifest.json` | `draft/` | 命令元数据 |
| `command.js` | `draft/` | 命令实现 |
| `README.md` | `draft/` | 面向调用者的文档 |
| `context.md` | `draft/` | 面向未来修复者的上下文 |

创建完成后，向用户汇报工作区已创建。若 `capture new` 输出了冲突警告（如 `BUILTIN_OVERRIDE`），一并告知用户，然后直接进入状态驱动循环。

### 2. 状态驱动循环

反复执行 `capture status <name>`，按返回的提示推进，然后重新查询状态，直到所有 artifact 完成。

**关键规则**：

- `validation` 的推进方式是执行 `capture validate <name>`，不是修改文件。
- 验证通过后若修改 draft，`validation` 会因 fingerprint 失效而回到 blocked，须重新 validate。
- 禁止凭记忆推进，每完成一个动作后必须重新执行 `capture status`。

#### `capture validate` 的验证内容

当 evidence、command、manifest、readme、context 全部 `done` 后，`validation` 会要求执行 `capture validate`：

```bash
websculpt capture validate <name>
```

`capture validate` 检查 draft 的合法性，包括 manifest 结构、代码合规性和 runtime 合约匹配。验证失败会返回具体错误信息，按提示修复即可。验证通过后生成 `validation.json` 并计算 draft 文件的 fingerprint。如果后续修改了 draft 文件，fingerprint 会失效，再次执行 `capture status` 时 `validation` 会回到 `blocked`，要求重新 validate。

### 3. 安装

当 `capture status` 返回所有 artifact 均为 `done` 时，直接执行：

```bash
websculpt capture finalize <name>
```

**注意**：此时无需再次询问用户，直接执行 finalize 即可。首次安装不需要 `--force`，覆盖已安装命令时需附加 `--force`。

**关键规则**：已安装命令只是 draft 的副本。发现问题只改工作区 draft 文件并重新 finalize，不要直接修改已安装目录。工作区保留供后续修复参考。

### 4. 安装后测试

安装完成后，必须执行 **至少 4 组真实命令调用**，强制覆盖以下场景：

| # | 场景 | 目的 |
|---|------|------|
| 1 | Happy path：使用探索阶段验证过的核心参数组合 | 验证正确性，输出结构与预期一致 |
| 2 | 不同有效参数组合（与核心参数不同的过滤条件、时间范围等） | 验证泛化性 |
| 3 | 边界参数（空值、极限值、可选参数省略） | 验证鲁棒性 |
| 4 | 错误场景（非法参数、资源不存在、缺少必填参数） | 验证错误处理与返回码 |

测试流程示例：

```bash
websculpt <domain> <action> --param1 value1
websculpt <domain> <action> --param1 value2 --param2 value3
websculpt <domain> <action> --param1 ""
websculpt <domain> <action> --invalid-param value
```

finalize 前，先将 4 组测试的具体命令写入 `testScenarios`，确认覆盖完整后再执行 `capture finalize`。

测试完成后，向用户汇报结果：

- **全部通过**：汇报每组场景的关键验证点。
- **发现问题并修复**：汇报问题原因、修复措施及最终验证结果。

**测试失败时进入修复循环**：

1. `repairCount += 1`，`repairStep` 设为 `modify`。分析原因并修改 draft 文件。
2. `repairStep` 更新为 `status1`，执行 `capture status <name>`。
3. `repairStep` 更新为 `validate`，执行 `capture validate <name>`。
4. `repairStep` 更新为 `status2`，执行 `capture status <name>`。
5. `repairStep` 更新为 `finalize`，执行 `capture finalize <name> --force`。
6. `repairStep` 重置为 `null`，重新执行全部 4 组测试，记录结果到 `testResults`。
7. **熔断**：`repairCount >= 3` 时，停止自动循环，向用户汇报问题并交由用户决策。

## Evidence 写作规范

`evidence.md` 是 capture 阶段的事实来源，全文必须使用英文撰写，**不得修改 5 个 H2 标题**。

原文模板已包含各标题的写作提示，此处仅补充强调：

- `Verified URLs` 中的 URL 必须带协议。
- `Structural Evidence` 是 `command.js` 的实现依据，必须写清已验证的结构事实。
- `browser` runtime 需在 `Exploration Path` 中说明是否查阅了 `guide.md`。
- 缺少 heading 或 heading 下无内容会阻断审核；keyword gaps 不会阻断，仅作为 warning。

## Draft 实现规范

### `manifest.json`

`capture new` 已自动生成 identity 字段（id、domain、action、runtime）和 `requiresBrowser`，打开文件即可见。

你需要补充的内容：
- `description`：非空描述。`capture status` 以此判断 manifest 是否完成。
  - 要求：说明命令做什么、需要什么输入、返回什么结果，长度适中。命令列表中会展示此描述，太简短或模糊会导致使用者看不懂。
- `parameters`：根据 `command.js` 中实际使用的 `params.xxx` 声明，name 不可重复。

  示例：

  ```json
  "parameters": [
    { "name": "query", "description": "搜索关键词", "required": true },
    { "name": "limit", "description": "返回数量", "required": false, "default": 10 }
  ]
  ```
- `authRequired`：命令是否需要登录/认证。
  - `"required"`：需要登录（如访问个人数据）
  - `"not-required"`：不需要登录（如公开 API）
  - `"unknown"`：默认值，不建议保留

关键约束：
- `command.js` 中访问的 `params.xxx` 必须在 `parameters` 中声明，否则 `capture validate` 报错。
- manifest 中已声明 `default` 的参数，不要在 `command.js` 中再写 fallback。

### `command.js`

**阅读先决条件**：在编辑 `draft/command.js` 之前，**必须**阅读对应 runtime 的 contract 文档（`skills/websculpt-capture/references/node-contract.md` 或 `browser-contract.md`）。阅读完成后将 `CaptureSession.contractRead` 设为 `true`。`contractRead` 为 `false` 时，禁止编辑或修改 `command.js`。

导出格式：`export default async function(params)`（node）或 `export default async (page, params)`（browser）。

核心约束：
- 参数值都是字符串，数字用 `parseInt`/`parseFloat`，布尔用 `=== "true"`。
- 返回值须为可序列化纯数据。
- 业务错误：`const err = new Error("[CODE] 消息"); err.code = "CODE"; throw err;`
- 只能 import Node.js 内置模块，禁止第三方依赖和 inline import。

详细规范见 `skills/websculpt-capture/references/node-contract.md` 或 `skills/websculpt-capture/references/browser-contract.md`（按 runtime）。

错误码规范：大写蛇形命名，语义明确。例如 `AUTH_REQUIRED`（需登录）、`NOT_FOUND`（资源不存在）、`EMPTY_RESULT`（结果为空）、`MISSING_PARAM`（缺少必填参数）、`DRIFT_DETECTED`（页面结构变化）。

## 禁止

- 不得在路径未经 explore 验证（`exploreVerified: false`）时执行 `capture new`。
- 不得在展示契约的回复中调用任何工具或执行任何 `capture` 子命令。
- 不得在 `CaptureSession.userIntentConfirmed` 为 `true` 前执行 `capture new`。
- 不得在 `contractRead` 为 `true` 前编辑 `draft/command.js`。
- 不得在 `capture status` 返回 blocked 时强行推进。
- 不得在 evidence audit 通过前填写 draft。
- `capture new` 后直接进入状态驱动循环，不得再次因冲突汇报要求用户确认（冲突应在前置确认中已告知并处理）。
- 不得直接修改已安装命令（始终修改工作区 draft 并重新 finalize）。
