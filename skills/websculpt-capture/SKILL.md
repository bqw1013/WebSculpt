---
name: websculpt-capture
description: 用于将信息获取路径沉淀为 WebSculpt 本地可复用命令的场景。把已验证的路径固化为命令资产后，后续同类需求可直接调用，无需重复探索，节省上下文与 token。本 skill 仅在经过 explore 阶段验证路径后加载。当用户同意沉淀 explore 结果，或需要将已跑通的网页/API/浏览器提取逻辑固化为本地命令资产时加载。若路径尚未经过 explore 验证，必须先加载 websculpt-explore 完成探索。
---

# WebSculpt Capture

## 职责

你是 WebSculpt 的 capture 实现者，负责将已验证的信息获取路径转化为本地可复用、可执行的 `domain/action` 命令资产。

你对命令的**设计质量、实现正确性和交付可用性**负全责。CLI 状态机通过 `capture status` 检查各 artifact 的完成进度，你负责推进状态并确保内容正确，安装前必须通过真实调用验证命令可用。

**探索先决条件**：capture 必须建立在已验证路径之上。如果当前路径尚未经过 explore 阶段验证（无 `trace.md` 审计完成记录），你必须先加载 `websculpt-explore` 完成探索，填写 `trace.md` 并执行 `explore assess <name>` 通过审计后，再将 `exploreVerified` 设为 `true`，然后进入 capture。

交付后因目标页面或 API 变化导致的失效，由 `websculpt-maintain` 处理，不属于 capture 职责。

## CaptureSession（强制）

进入 capture 阶段后，只输出 CaptureSession。每次回复的**结尾**必须输出当前 CaptureSession 状态块。格式如下：

```yaml
CaptureSession:
  exploreVerified: false
  contractRead: false
  testScenarios: []
  testResults: []
  repairCount: 0
  repairStep: null
```

### 状态规则

- `exploreVerified` 为 `false` 时，**禁止**执行 `capture new`。必须先确认路径已经过 explore 验证（`explore assess` 返回 `status: passed`）；若未验证，必须先加载 `websculpt-explore` 完成探索、填写 `trace.md` 并通过审计。
- `contractRead` 为 `false` 时，**禁止**编辑或修改 `draft/command.js`。必须先阅读对应 runtime 的 contract 文档并设为 `true`。
- `testScenarios` 为空时，**禁止**执行 `capture finalize`。finalize 前必须列出具体测试命令，覆盖 happy path、泛化参数、边界参数、错误场景；测试数量以 4 组为基线，命令更复杂时追加。
- `testResults` 长度 < 4 时，**禁止**汇报"测试通过"或"测试完成"。
- 修复循环中，`repairStep` 必须按顺序推进，禁止跳步：
  1. `null` → 修改 draft 文件 → `modify`
  2. `modify` → 执行 `capture status` → `status1`
  3. `status1` → 执行 `capture validate` → `validate`
  4. `validate` → 执行 `capture status` → `status2`
  5. `status2` → 执行 `capture finalize --force` → `finalize`
  6. `finalize` → 重置为 `null`，`repairCount += 1`，重新执行全部已设计的测试

### 更新时机

- 确认路径已通过 explore 验证后（`explore assess` 返回 passed）：`exploreVerified` 设为 `true`
- 阅读对应 runtime 的 contract 文档后：`contractRead` 设为 `true`
- finalize 前：将设计的测试命令写入 `testScenarios`
- 每组测试执行后：记录结果到 `testResults`
- 进入修复循环时：`repairCount += 1`，`repairStep` 设为 `modify`
- 每完成一个修复动作：按顺序更新 `repairStep`
- 修复完成（`finalize --force` 后）：`repairStep` 重置为 `null`

## 流程

1. 确认 `exploreVerified: true`（`explore assess` 已返回 `status: passed`），然后执行 `capture new` 创建工作区。
2. 直接进入状态驱动循环。
3. 反复执行 `capture status`，按 artifact 状态推进（填写 evidence 和 draft 文件，执行 `capture validate`），直到所有 artifact 均为 `done`。
4. 执行 `capture finalize` 安装为可执行命令。
5. 执行至少 4 组真实命令测试；不通过则进入修复循环。

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
| 同时需要浏览器和本地文件系统 | 使用 `browser` runtime，并通过 `cwd` 参数解析相对路径 |

一个命令只能声明一种 runtime。

`capture new` 在当前目录创建 `.websculpt/captures/<name>/` 工作区，包含以下文件：

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

### Browser Runtime 测试注意事项

**独立的浏览器连接**

`@playwright/cli`（explore 阶段）与 websculpt daemon（capture 执行阶段）是**两次独立的 CDP attach**。explore 时成功连接，不代表 capture 测试时自动可用。

**首次连接的系统弹窗**

daemon 首次尝试 `connectOverCDP` 时，Chrome 可能弹出"允许远程调试"的系统确认对话框。用户若点击较慢，连接可能超时。

**排查提示**

测试过程中若命令返回 `BROWSER_ATTACH_REQUIRED`，排查时除确认远程调试已开启，也请考虑：是否因确认弹窗未及时处理导致连接失败。

### 4. 安装后测试

安装完成后，必须执行 **至少 4 组真实命令调用**。4 组是基线，具体数量应根据命令复杂度判断；参数组合多、分支多或错误场景多的命令，应追加到覆盖完整为止。这些测试必须覆盖以下场景：

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

finalize 前，先将这些测试的具体命令写入 `testScenarios`，确认覆盖完整后再执行 `capture finalize`。

测试完成后，向用户汇报结果：

- **全部通过**：汇报每组场景的关键验证点。
- **发现问题并修复**：汇报问题原因、修复措施及最终验证结果。

**测试失败时进入修复循环**：

1. `repairCount += 1`，`repairStep` 设为 `modify`。分析原因并修改 draft 文件。
2. `repairStep` 更新为 `status1`，执行 `capture status <name>`。
3. `repairStep` 更新为 `validate`，执行 `capture validate <name>`。
4. `repairStep` 更新为 `status2`，执行 `capture status <name>`。
5. `repairStep` 更新为 `finalize`，执行 `capture finalize <name> --force`。
6. `repairStep` 重置为 `null`，重新执行全部已设计的测试，记录结果到 `testResults`。

## Evidence 写作规范

`evidence.md` 是 capture 阶段的事实来源，全文必须使用英文撰写，**不得修改 5 个 H2 标题**。

原文模板已包含各标题的写作提示，此处仅补充强调：

- `Verified URLs` 中的 URL 必须带协议。
- `Structural Evidence` 是 `command.js` 的实现依据，必须写清已验证的结构事实。
- `browser` runtime 必须在 `Exploration Path` 中写入：`已阅读 guide.md`。
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

导出格式：`export default async function(params)`（node）或 `export default async (page, params, cwd)`（browser）。

核心约束：
- 参数值都是字符串，数字用 `parseInt`/`parseFloat`，布尔用 `=== "true"`。
- 返回值须为可序列化纯数据。
- 业务错误：`const err = new Error("[CODE] 消息"); err.code = "CODE"; throw err;`
- 只能 import Node.js 内置模块，禁止第三方依赖和 inline import。
- **模板骨架保留**：`capture new` 生成的 `command.js` 中的导出格式和函数签名是 runtime contract 的硬性约定，必须原样保留。只替换 `TODO:` 注释及占位逻辑（如 `return { ok: true };`），不得修改导出方式、函数签名或参数顺序。
- **优先复用 explore 验证结果**：编写 `command.js` 时应优先参考 explore 阶段已跑通的路径。验证过的选择器、API endpoint、交互步骤和失败信号，应在代码中优先复用；若发现已验证路径与当前实现有冲突，应回溯检查 explore 记录是否完整，而非直接弃用已验证路径凭猜测重新编写。

详细规范见 `skills/websculpt-capture/references/node-contract.md` 或 `skills/websculpt-capture/references/browser-contract.md`（按 runtime）。

### 错误码

命令必须对失败路径做完整覆盖，且仅允许使用封闭清单内的 code。

- **覆盖率**：所有可预期失败分支（参数校验、资源寻址、环境前置、限流与封锁、网络与超时、结构漂移、动作执行失败）都必须抛出清单内 code；禁止静默吞错或以 `ok: false` 代替。
- **封闭清单**：仅允许使用本节清单内的 14 个 code；清单外 code 视为违约，需要新 code 时先修订本标准。
- **命名**：大写蛇形；code 仅标识失败类别，参数名、站点名、命令名等定位信息写入 `message`，不进入 code。

**封闭清单**

| 处置类别 | code | 触发条件 | 调用方处置 |
|------|------|------|------|
| 修正请求后重试 | `INVALID_PARAM` | 参数非法：类型、范围、枚举或 URL 形态不符；请求量超过上限 | 修正请求后重试 |
| 修正请求后重试 | `MISSING_PARAM` | 必填参数缺失或为空 | 补充参数后重试 |
| 修正请求后重试 | `NOT_FOUND` | 目标资源不存在：页面、条目、用户、话题、标签页、未开播直播间 | 修正寻址或跳过该条目 |
| 修复执行环境后重试 | `AUTH_REQUIRED` | 无可用会话，需人工登录 | 完成登录后重试 |
| 修复执行环境后重试 | `AUTH_EXPIRED` | 会话、token 或 cookie 曾有效、现已失效 | 刷新凭据后重试 |
| 修复执行环境后重试 | `BROWSER_ATTACH_REQUIRED` | 浏览器会话未接入 | 接入浏览器后重试 |
| 修复执行环境后重试 | `TOOL_MISSING` | 外部依赖缺失（如 yt-dlp） | 安装依赖后重试 |
| 退避后重试 | `RATE_LIMITED` | 被明确限流：429、too many requests、daemon 忙 | 等待后原样重试 |
| 退避后重试 | `BLOCKED` | 站点主动拒绝自动化：验证码、挑战、反爬、拒绝访问 | 延长等待或更换访问方式 |
| 瞬时故障，原样重试 | `NETWORK_ERROR` | 传输层失败，未拿到可用响应；含浏览器导航失败 | 原样重试 |
| 瞬时故障，原样重试 | `TIMEOUT` | 操作超时 | 稍后原样重试 |
| 瞬时故障，原样重试 | `UPSTREAM_ERROR` | 已拿到响应但服务端出错：5xx、API 错误体、GraphQL errors | 稍后原样重试 |
| 命令缺陷，修复命令后重试 | `DRIFT_DETECTED` | 响应到达但不符合预期：结构变化、节点缺失、解析失败、可疑的空 | 修复命令；重试无意义 |
| 未分类执行失败 | `EXEC_FAILED` | 动作类命令（下载、上传、提交、切换）执行中途失败，且以上各类均不适用 | 排查后决定重试或修复 |

**空结果约定**

`EMPTY_RESULT` 已废除，禁止作为错误码使用：

- 空是资源的正常状态（视频无评论、搜索无命中）→ 正常返回，`data` 为空集。
- 空违背资源本性（热榜为空）→ `DRIFT_DETECTED`。
- 寻址的单体资源不存在 → `NOT_FOUND`。

**判定顺序**

为失败分支分配 code 时，按以下顺序取第一个命中：

1. 输入校验失败（在任何 I/O 之前）：缺必填 → `MISSING_PARAM`；参数非法 → `INVALID_PARAM`；目标不存在 → `NOT_FOUND`。
2. 本地前置缺失（登录、浏览器、外部工具）→ 环境族；纯重试可恢复的不归此类，归瞬时故障族。
3. 站点主动拒绝：明确限流 → `RATE_LIMITED`；拒绝自动化本身 → `BLOCKED`。
4. 传输失败、超时、服务端错误 → `NETWORK_ERROR` / `TIMEOUT` / `UPSTREAM_ERROR`。
5. 响应到达但不符合预期 → `DRIFT_DETECTED`。
6. 动作执行失败且以上均不适用 → `EXEC_FAILED`。
7. 一切正常只是没有结果 → 成功返回 + 空 `data`，不是错误。

## 禁止

- 不得在路径未经 explore 验证（`exploreVerified: false`）时执行 `capture new`。
- 不得在 `contractRead` 为 `true` 前编辑 `draft/command.js`。
- 不得在 `capture status` 返回 blocked 时强行推进。
- 不得在 evidence audit 通过前填写 draft。
- `capture new` 后直接进入状态驱动循环，不得再次因冲突汇报要求用户确认（冲突应在前置确认中已告知并处理）。
- 不得直接修改已安装命令（始终修改工作区 draft 并重新 finalize）。
