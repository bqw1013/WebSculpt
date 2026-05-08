# Capture 实现设计方案

> 本文档基于 WebSculpt 当前架构和多次设计讨论，记录 Capture 工作流的完整实现方案。涵盖 3-skill 架构调整、工作区设计、CLI 命令、Evidence Audit、状态机和实施路线图。
>
> 本文档生效后，取代 `docs/Capture-Overview.md` 和 `docs/Capture-CLI.md` 中的冲突内容。

---

## 1. 背景与动机

### 1.1 当前问题

WebSculpt 已具备命令包生命周期能力：

```bash
websculpt command draft <domain> <action>
websculpt command validate --from-dir <path> [domain] [action]
websculpt command create <domain> <action> --from-dir <path>
```

但真实 Agent 使用中存在更上层的问题：

- Agent 完成信息获取后，缺少评估是否值得沉淀的强制检查点。
- `command draft` 只生成骨架，不记录探索为什么值得沉淀、依赖什么选择器。
- `command validate/create` 只检查命令包是否合规，不关心实现是否来自已验证路径。
- 后续修复命令时，缺少集中保存的探索证据、失效信号和实现依据。

### 1.2 核心动机

在"探索路径"和"正式命令资产"之间增加一个**轻量工作区**，让 Agent 有一个明确、可检查、可恢复的沉淀过程。同时解决三个关键问题：

1. **消除 explore → capture 的信息时间差**：查重、Assessment 不再在对话层完成，而是在工作区内通过 `capture status` 驱动。
2. **固化证据档案**：`evidence.md` 是跨 session 的唯一桥梁，新 session 的陌生 Agent 读完就能继续工作。
3. **状态机驱动**：Agent 不需要理解整个 capture 流程，只需要循环执行 `capture status` 并跟随 `next` 指示。

---

## 2. 架构调整：3-Skill 架构

### 2.1 原始 4-skill 设计的问题

原始设计将 capture 和 compile 拆分为两个独立 skill：

| Skill | 职责 |
|-------|------|
| `websculpt-capture` | 评估、查重、创建工作区、编写 evidence |
| `websculpt-compile` | 读取 evidence、实现 command.js、validate、finalize |

但在实际流程中：
- `capture new` 同时生成了 draft 骨架
- `capture status` 驱动了"填 command.js / README.md / context.md"
- `capture validate/finalize` 成为状态机出口

**capture 和 compile 已经是一个连续流水线，所有文件都在 `.websculpt-captures/<name>/` 内，强行拆分只会增加 Agent 的上下文切换成本。**

### 2.2 新 3-skill 架构

```text
websculpt-explore     信息获取，输出 Capture Assessment（独立，因为 explore 可单独使用）
websculpt-capture     合并原 capture + compile，覆盖 new → finalize 全流程
websculpt-repair      未来修复（空骨架保留）
```

**为什么不把 explore 也合并？**

因为 explore 有独立使用场景：用户只要数据、不要沉淀。例如：

```text
用户："帮我查下 GitHub trending"
Agent explore → 拿到数据
用户："谢谢，不用沉淀" → 结束
```

explore 必须能独立完成任务。

### 2.3 职责边界

| 阶段 | Skill | 驱动方式 | 产出 |
|------|-------|---------|------|
| explore | `websculpt-explore` | ExploreSession 状态块 | 任务结果 + Capture Assessment |
| 过渡 | 对话层 | 用户确认 | 进入 capture |
| capture | `websculpt-capture` | `capture status` 返回值 | 命令库中的可用命令 |

---

## 3. 完整动线

以"获取 GitHub Python 热门趋势"为例：

### 阶段 1：Explore

Agent 加载 `websculpt-explore` skill。

1. 输出 `ExploreSession` 状态块，`commandListChecked: false`
2. 执行 `websculpt command list`，发现无匹配命令
3. 选择 `browser`，`guideRead: false`，阅读 `guide.md`
4. 浏览器探索 `https://github.com/trending/python?since=daily`，提取数据
5. 返回结果给用户，状态块中输出 **Capture Assessment**

**Explore 产出**：
- 用户看到的：任务结果（JSON）
- Agent 上下文留下的：`ExploreSession` 状态块，内含 `captureAssessment`

Agent 问用户："本次路径建议沉淀为 `github/list-trending` 命令，是否继续？"

### 阶段 2：Capture

用户同意后，Agent 加载 `websculpt-capture` skill。

```text
执行 capture new github-py-trending --domain github --action list-trending --runtime browser
  ↓
Agent 根据返回的 commandLibrarySnapshot 向用户汇报查重结果，请求确认
  ↓
用户确认继续
  ↓
capture status github-py-trending → next: fill-evidence（后续 CLI 实现）
  ↓
Agent 填 evidence.md
  ↓
capture status github-py-trending → next: fill-command
  ↓
Agent 实现 draft/command.js
  ↓
capture status github-py-trending → next: fill-readme
  ↓
Agent 编写 draft/README.md
  ↓
capture status github-py-trending → next: fill-context
  ↓
Agent 编写 draft/context.md
  ↓
capture status github-py-trending → next: validate
  ↓
Agent 执行 capture validate github-py-trending
  ↓
capture status github-py-trending → next: request-user-confirmation
  ↓
Agent 向用户展示摘要，请求确认
  ↓
用户确认
  ↓
Agent 执行 capture finalize github-py-trending
```

**Agent 不需要理解整个流程，只需要循环执行 `capture status` 并跟随 `next`。**

---

## 4. 工作区与文件设计

### 4.1 目录结构

工作区位于**项目当前目录**下：

```text
.websculpt-captures/
└── <name>/
    ├── capture.yaml      # 机器可读元数据 + 命令库快照
    ├── evidence.md       # 探索证据（Agent 填写，系统审计）
    ├── draft/            # 命令包骨架（capture new 一并生成）
    │   ├── manifest.json # 预填 domain/action/runtime，id 留空
    │   ├── command.js    # 运行时对应入口模板
    │   ├── README.md     # 模板
    │   └── context.md    # 模板
    └── validation.json   # 最近一次 validate 结果
```

### 4.2 `capture.yaml`

目标：**最小化身份声明 + 客观查重数据**。不存状态（状态由 `capture status` 动态计算）。

```yaml
name: github-py-trending
domain: github
action: list-trending
runtime: browser
createdAt: "2026-05-07T10:30:00.000Z"
schema: command-capture
commandLibrarySnapshot:
  totalCommands: 47
  sameDomainCommands:
    - "github/list-trending"
    - "github/search-repos"
  nameConflict: true
  conflictSource: "builtin"
# 以下为 repair 预留，MVP 固定为 null
repairOf: null
sourceCommand: null
supersedes: null
```

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 工作区标识，CLI 使用 |
| `domain` | 是 | 目标命令的 domain |
| `action` | 是 | 目标命令的 action |
| `runtime` | 是 | 执行运行时 |
| `createdAt` | 是 | ISO 8601，创建时写入 |
| `schema` | 是 | 固定 `command-capture` |
| `commandLibrarySnapshot` | 是 | `capture new` 时自动扫描命令库生成的客观数据 |
| `repairOf` | 否 | repair 预留 |
| `sourceCommand` | 否 | repair 预留 |
| `supersedes` | 否 | repair 预留 |

**为什么没有 `status` 字段？**

状态是派生的：有没有 `evidence.md`、evidence 通没通过 audit、`draft/` 填没填、`validation.json` 存不存在——这些都在文件系统上，`capture status` 实时算就行。

### 4.3 `evidence.md`

**核心设计原则**：
1. **标题结构强制**：5 个二级标题必须存在，不得修改
2. **内容非空检查**：每个标题下必须有实质内容
3. **关键词辅助检查**：作为补充验证

**模板**：

```markdown
# Evidence: {domain}/{action}

This document records the research and validation evidence for the `{domain}/{action}` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

## Capture Assessment

<!-- State whether this command should be captured and why. -->
```

**模板简化理由**：

命令库快照已经存储在 `capture.yaml` 中，不再重复写入 `evidence.md` 的注释块；evidence 模板仅保留 5 个英文 H2 标题和每段的写作提示。这样可以降低 Agent 把机器快照当作待编辑内容的概率，也与代码/注释使用英文的约束保持一致。

### 4.4 `draft/`

由 `capture new` 一并生成，结构与标准命令包一致：

```text
manifest.json    # 预填 domain/action/runtime，id 留空
command.js       # 运行时对应入口模板
README.md        # 模板
context.md       # 模板
```

`command.js` 模板中的 `// TODO: implement command logic` 或 `// TODO: implement command logic using page` 标记用于 `capture status` 判断"是否仍是模板"。

`README.md` 与 `context.md` 只要仍包含 `TODO:`，就会被视为模板未完成。

`capture status` 会检查 `draft/manifest.json` 的 `domain`、`action`、`runtime` 是否与 `capture.yaml` 一致。不一致时 `command` / `manifest` / `readme` / `context` / `validation` 均为 `blocked`，`next.action` 为 `fill-manifest`。如果 `manifest.json` 暂时不是合法 JSON，`capture status` 也会把 `manifest` 标记为 `blocked`，不会返回 `STATUS_ERROR`。

### 4.5 `validation.json`

由 `capture validate` 写入：

```json
{
  "success": true,
  "draftFingerprint": "sha256...",
  "warnings": [],
  "timestamp": "2026-05-07T12:00:00.000Z"
}
```

`draftFingerprint` 由 `manifest.json`、运行时入口文件、`README.md`、`context.md` 以及 `capture.yaml` 的 `domain/action/runtime` 共同计算。`capture status` 和 `capture finalize` 会对比当前 draft 指纹；如果成功验证后 draft 被修改，`validation` 会回到 `blocked`，`finalize` 会返回 `VALIDATION_STALE`。

---

## 5. Evidence Audit 设计

### 5.1 三层检查策略

| 层级 | 检查什么 | 可靠性 | 实现方式 |
|------|---------|--------|---------|
| **结构检查** | 5 个必需标题是否存在 | 高 | Parse Markdown 提取 `## ` 标题，精确匹配 |
| **内容检查** | 每个标题下是否有实质内容 | 高 | 标题段落到下一个同级标题之间，是否有非注释文本 |
| **关键词检查** | 关键信息是否提及 | 中 | 字符串匹配（查库、guide、URL、选择器等） |

**只有结构 + 内容检查通过，evidence 才算 `done`。关键词检查失败只发 warning，不 block。**

### 5.2 必需标题

```ts
const REQUIRED_H2 = [
  "Exploration Path",
  "Verified URLs",
  "Structural Evidence",
  "Failure Signals",
  "Capture Assessment",
];
```

Agent 不得修改标题文字。`capture status` 精确匹配，标题被改则报 `missing heading`。

### 5.3 内容非空判断

对每个匹配的 H2：
1. 提取该标题到下一个 H2 之间的所有行
2. 检查是否存在至少一行满足：非空行、非 HTML 注释、非 Markdown 标题

```ts
const hasContent = sectionLines.some((line) => {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<!--") && !trimmed.startsWith("#");
});
```

### 5.4 关键词辅助检查

```ts
const keywordGaps: string[] = [];
const lower = content.toLowerCase();

if (runtime === "browser" && !content.includes("guide.md")) {
  keywordGaps.push("guide-read");
}
if (!/https?:\/\//.test(content)) {
  keywordGaps.push("verified-urls");
}
// ... 其他关键词项
```

关键词失败不 block，只作为 warning 返回给 Agent。

### 5.5 Audit 返回格式

```ts
interface EvidenceAuditResult {
  passed: boolean;
  missingHeadings: string[];
  emptyHeadings: string[];
  keywordGaps: string[];
}
```

---

## 6. CLI 命令设计

### 6.1 命令一览

| 命令 | 职责 | 当前状态 |
|------|------|----------|
| `capture new` | 创建工作区 + draft 骨架，含命令库自动扫描 | 已实现 |
| `capture status` | 状态查询 + 审计 + 导航，Agent 的驱动引擎 | 已实现 |
| `capture validate` | 校验 draft，底层调用 `command validate`，并写入带指纹的 `validation.json` | 已实现 |
| `capture finalize` | 安装到命令库，硬门槛：fresh validation + audit + readyToFinalize | 已实现 |

**不实现 `capture draft` 和 `capture instructions`**：
- `capture draft` 的功能已合并到 `capture new`
- `capture instructions` 属于动态指令（方案 B），当前阶段暂缓

### 6.2 `capture new <name>`

```bash
websculpt capture new <name> \
  --domain <domain> \
  --action <action> \
  --runtime <runtime> \
  [--force]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 工作区标识，`^[a-z0-9-]+$` |
| `--domain` | 是 | 目标命令 domain |
| `--action` | 是 | 目标命令 action |
| `--runtime` | 是 | `node` / `browser` / `shell` / `python` |
| `--force` | 否 | 覆盖已存在的同名 capture |

**行为**：

1. 校验 `name` 格式
2. `normalizeRuntime(options.runtime)`
3. `RESERVED_DOMAINS` 检查
4. 扫描 builtin + user 命令库
5. **硬查重**：
   - user 命令已存在 && !force → `COMMAND_ALREADY_EXISTS`
   - builtin 已存在 → 警告 `BUILTIN_OVERRIDE`，继续创建
   - 工作区已存在 && !force → `CAPTURE_ALREADY_EXISTS`
6. 创建 `.websculpt-captures/<name>/` + `draft/`
7. 写入 `capture.yaml`（含 `commandLibrarySnapshot`）
8. 写入 `evidence.md` 模板
9. 生成 draft 骨架（manifest.json 预填 domain/action/runtime）

**成功输出**：

```json
{
  "success": true,
  "capture": {
    "name": "github-py-trending",
    "path": "<absolute-path>/.websculpt-captures/github-py-trending",
    "domain": "github",
    "action": "list-trending",
    "runtime": "browser"
  },
  "commandLibrarySnapshot": {
    "totalCommands": 47,
    "sameDomainCommands": ["github/list-trending", "github/search-repos"],
    "nameConflict": true,
    "conflictSource": "builtin"
  },
  "summary": {
    "domain": "github",
    "action": "list-trending",
    "duplicateWarning": "Builtin command \"github/list-trending\" exists; finalizing this capture would create a user override.",
    "estimatedSteps": 5
  },
  "next": "websculpt capture status github-py-trending"
}
```

### 6.3 `capture status <name>`

```bash
websculpt capture status <name> [--format json]
```

**行为**：读取工作区全部文件，计算状态机。

**Artifact 状态规则**：

| Artifact | blocked | ready | done |
|----------|---------|-------|------|
| `evidence` | 缺少标题 / 内容为空 / audit 失败 | — | audit passed |
| `command` | evidence 未完成、manifest identity mismatch、入口文件缺失 | evidence done 且入口文件仍是模板 | 非模板 |
| `manifest` | command 未完成、manifest identity mismatch、manifest JSON 无效或缺失 | command done 但 description 为空 | description 非空 |
| `readme` | manifest 未完成、manifest identity mismatch、README 缺失 | manifest done 但 README.md 含 `TODO:` | 不含 `TODO:` |
| `context` | readme 未完成、manifest identity mismatch、context 缺失 | readme done 但 context.md 含 `TODO:` | 不含 `TODO:` |
| `validation` | 前面 artifact 未完成、manifest mismatch、`validation.json` 缺失/失败/过期 | — | `validation.json.success === true` 且 draft 指纹匹配 |

**`readyToFinalize`** = 全部 6 个 artifacts done，且 validation success 对应当前 draft 指纹。

**`next` 推导**：

| 当前状态 | `next.action` |
|---------|--------------|
| evidence blocked | `fill-evidence` |
| manifest identity mismatch | `fill-manifest` |
| command blocked/ready | `fill-command` |
| manifest blocked/ready | `fill-manifest` |
| readme blocked/ready | `fill-readme` |
| context blocked/ready | `fill-context` |
| validation blocked | `validate` |
| 全部 done | `request-user-confirmation` |

**返回示例（blocked）**：

```json
{
  "success": true,
  "capture": {
    "name": "github-py-trending",
    "path": "<absolute-path>/.websculpt-captures/github-py-trending"
  },
  "artifacts": {
    "evidence": {
      "status": "blocked",
      "reason": "Evidence audit failed",
      "detail": {
        "missingHeadings": ["Verified URLs", "Failure Signals"],
        "emptyHeadings": [],
        "keywordGaps": ["verified-urls"]
      }
    },
    "command": { "status": "blocked", "reason": "Evidence is not complete" },
    "manifest": { "status": "blocked", "reason": "Command is not complete" },
    "readme": { "status": "blocked", "reason": "Manifest is not complete" },
    "context": { "status": "blocked", "reason": "README is not complete" },
    "validation": { "status": "blocked", "reason": "Draft artifacts are not complete" }
  },
  "readyToFinalize": false,
  "next": {
    "action": "fill-evidence",
    "target": "evidence.md"
  }
}
```

**返回示例（ready to finalize）**：

```json
{
  "success": true,
  "capture": {
    "name": "github-py-trending",
    "path": "<absolute-path>/.websculpt-captures/github-py-trending"
  },
  "artifacts": {
    "evidence": { "status": "done", "detail": { "keywordGaps": [] } },
    "command": { "status": "done" },
    "manifest": { "status": "done" },
    "readme": { "status": "done" },
    "context": { "status": "done" },
    "validation": { "status": "done" }
  },
  "readyToFinalize": true,
  "next": {
    "action": "request-user-confirmation"
  }
}
```

### 6.4 `capture validate <name>`

```bash
websculpt capture validate <name>
```

**行为**：
1. 读取 `capture.yaml` 获取 `domain`, `action`
2. 调用 `handleCommandValidate(draftPath, domain, action)`
3. 检查 `draft/manifest.json` 的 `domain/action/runtime` 是否与 `capture.yaml` 一致；若不一致，即使底层 `command validate` 成功，也返回并持久化 `MANIFEST_MISMATCH`
4. 计算当前 draft 指纹
5. 结果写入 `.websculpt-captures/<name>/validation.json`

### 6.5 `capture finalize <name>`

```bash
websculpt capture finalize <name> [--force]
```

**硬门槛**（全部必须满足）：

1. `validation.json` 存在且 `success: true`
2. `validation.json.draftFingerprint` 与当前 draft 指纹一致，否则返回 `VALIDATION_STALE`
3. `evidence.md` 通过 `auditEvidence()`（结构 + 内容）
4. `computeCaptureStatus(name).readyToFinalize === true`，否则返回 `DRAFT_NOT_READY`
5. 安装时调用 `command create`；若 `capture new --force` 曾允许 user 命令冲突，或用户在 finalize 显式传入 `--force`，则覆盖已有 user 命令

**失败示例**：

```json
{
  "success": false,
  "error": {
    "code": "EVIDENCE_NOT_READY",
    "message": "Evidence audit failed: Missing headings: Verified URLs, Failure Signals"
  }
}
```

**成功输出**：

```json
{
  "success": true,
  "command": "github/list-trending",
  "path": "~/.websculpt/commands/github/list-trending",
  "source": ".websculpt-captures/github-py-trending/draft"
}
```

---

## 7. 状态机设计

### 7.1 形式化定义

`capture status` 是一个**纯函数式状态机**：每次调用都重新扫描文件系统，根据扫描结果计算当前状态和下一步动作。不维护内存中的持久状态。

```text
状态机 = (S, I, O, δ, λ)

S  = 工作区的所有可能状态（由文件系统组合决定）
I  = 输入（文件系统快照）
O  = 输出（capture status 的 JSON 返回）
δ  = 状态转移函数（从文件内容推导 artifact 状态）
λ  = 输出函数（从 artifact 状态推导 next action）
```

### 7.2 状态空间 S

整体状态是 6 个 artifact 子状态的笛卡尔积：

| Artifact | 可能的子状态 | 说明 |
|----------|-------------|------|
| `evidence` | `blocked` → `done` | 由 evidence audit 决定 |
| `command` | `blocked` → `ready` → `done` | 依赖 evidence、manifest identity、入口文件内容 |
| `manifest` | `blocked` → `ready` → `done` | 依赖 command、manifest JSON、description、identity 一致性 |
| `readme` | `blocked` → `ready` → `done` | 依赖 manifest + README 内容 |
| `context` | `blocked` → `ready` → `done` | 依赖 readme + context 内容 |
| `validation` | `blocked` → `done` | 依赖 draft 完成、validate 结果和 draft 指纹 |

`readyToFinalize` = `evidence === done && command === done && manifest === done && readme === done && context === done && validation === done`

### 7.3 输入 I

```ts
interface StatusInput {
  captureYaml: CaptureYaml;
  evidenceExists: boolean;
  evidenceContent: string;
  draftManifestExists: boolean;
  draftManifestValid: boolean;
  manifestIdentityMatches: boolean;
  manifestDescriptionEmpty: boolean;
  commandJsExists: boolean;
  commandJsIsTemplate: boolean;
  readmeExists: boolean;
  readmeIsTemplate: boolean;
  contextExists: boolean;
  contextIsTemplate: boolean;
  validationExists: boolean;
  validationSuccess: boolean;
  validationDraftFingerprint: string | undefined;
  currentDraftFingerprint: string;
}
```

### 7.4 转移函数 δ

对每个 artifact 独立计算：

```ts
function evidenceStatus(input: StatusInput): "blocked" | "done" {
  if (!input.evidenceExists) return "blocked";
  const audit = auditEvidence(input.evidenceContent, input.captureYaml.runtime);
  return audit.passed ? "done" : "blocked";
}

function commandStatus(input: StatusInput): "blocked" | "ready" | "done" {
  if (evidenceStatus(input) !== "done") return "blocked";
  if (!input.manifestIdentityMatches) return "blocked";
  if (!input.commandJsExists) return "blocked";
  return input.commandJsIsTemplate ? "ready" : "done";
}

function manifestStatus(input: StatusInput): "blocked" | "ready" | "done" {
  if (!input.manifestIdentityMatches) return "blocked";
  if (commandStatus(input) !== "done") return "blocked";
  if (!input.draftManifestExists || !input.draftManifestValid) return "blocked";
  return input.manifestDescriptionEmpty ? "ready" : "done";
}

function readmeStatus(input: StatusInput): "blocked" | "ready" | "done" {
  if (!input.manifestIdentityMatches) return "blocked";
  if (manifestStatus(input) !== "done") return "blocked";
  if (!input.readmeExists) return "blocked";
  return input.readmeIsTemplate ? "ready" : "done";
}

function contextStatus(input: StatusInput): "blocked" | "ready" | "done" {
  if (!input.manifestIdentityMatches) return "blocked";
  if (readmeStatus(input) !== "done") return "blocked";
  if (!input.contextExists) return "blocked";
  return input.contextIsTemplate ? "ready" : "done";
}

function validationStatus(input: StatusInput): "blocked" | "done" {
  if (commandStatus(input) !== "done") return "blocked";
  if (manifestStatus(input) !== "done") return "blocked";
  if (readmeStatus(input) !== "done") return "blocked";
  if (contextStatus(input) !== "done") return "blocked";
  if (!input.validationExists) return "blocked";
  if (!input.validationSuccess) return "blocked";
  return input.validationDraftFingerprint === input.currentDraftFingerprint ? "done" : "blocked";
}
```

### 7.5 输出函数 λ

```ts
function nextAction(statuses: ArtifactStatuses): NextAction {
  if (statuses.evidence === "blocked") {
    return { action: "fill-evidence", artifact: "evidence" };
  }
  if (statuses.manifest === "blocked" && manifestIdentityMismatch) {
    return { action: "fill-manifest", artifact: "manifest" };
  }
  if (statuses.command === "blocked" || statuses.command === "ready") {
    return { action: "fill-command", artifact: "command" };
  }
  if (statuses.manifest === "blocked" || statuses.manifest === "ready") {
    return { action: "fill-manifest", artifact: "manifest" };
  }
  if (statuses.readme === "blocked" || statuses.readme === "ready") {
    return { action: "fill-readme", artifact: "readme" };
  }
  if (statuses.context === "blocked" || statuses.context === "ready") {
    return { action: "fill-context", artifact: "context" };
  }
  if (statuses.validation === "blocked") {
    return { action: "validate", artifact: "validation" };
  }
  return { action: "request-user-confirmation" };
}
```

### 7.6 状态转移图

```text
                    用户同意沉淀
                         │
                         ▼
              ┌─────────────────────┐
              │    capture new      │
              │   (初始化状态机)     │
              └──────────┬──────────┘
                         │
                         ▼
    ┌──────────────────────────────────────────┐
    │  evidence: blocked                         │
    │  command/manifest/readme/context: blocked  │
    │  validation: blocked                       │
    │  next: fill-evidence                       │
    └──────────────────┬───────────────────────┘
                       │
         Agent 填写 evidence.md
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │  evidence: done                            │
    │  command: ready                            │
    │  manifest/readme/context: blocked          │
    │  validation: blocked                       │
    │  next: fill-command                        │
    └──────────────────┬───────────────────────┘
                       │
         Agent 实现 command.js
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │  evidence: done                            │
    │  command: done                             │
    │  manifest: ready                           │
    │  readme/context: blocked                   │
    │  validation: blocked                       │
    │  next: fill-manifest                       │
    └──────────────────┬───────────────────────┘
                       │
         Agent 填写 manifest.json
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │  evidence: done                            │
    │  command: done                             │
    │  manifest: done                            │
    │  readme/context: ready                     │
    │  validation: blocked                       │
    │  next: fill-readme / fill-context          │
    └──────────────────┬───────────────────────┘
                       │
         Agent 填写 README.md / context.md
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │  evidence: done                            │
    │  command/manifest/readme/context: done     │
    │  validation: blocked                       │
    │  next: validate                            │
    └──────────────────┬───────────────────────┘
                       │
         Agent 执行 capture validate
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │  evidence: done                            │
    │  command/manifest/readme/context: done     │
    │  validation: done                          │
    │  readyToFinalize: true                     │
    │  next: request-user-confirmation           │
    └──────────────────┬───────────────────────┘
                       │
         Agent 向用户展示摘要，请求确认
                       │
                       ▼
              ┌─────────────────────┐
              │  capture finalize   │
              │   (状态机正常结束)   │
              └─────────────────────┘
```

### 7.7 关键特征

**1. 无内部状态**

`capture status` 不维护内存中的状态。每次调用都重新读取文件系统。这意味着：
- Agent 可以随意修改文件，`capture status` 永远返回最新真相
- 跨 session 完全安全：新 session 调用 `capture status` 就能得到当前状态

**2. 单向推进**

理论上 Agent 可以倒退（比如把 `command.js` 改回模板，状态从 `done` 退回到 `ready`）。这在技术上是允许的，也是合理的——修复代码时可能暂时"回退"到 ready 状态。

**3. 分层依赖**

```
evidence ──→ command/readme/context ──→ validation ──→ finalize
   ↑              ↑                      ↑
   └──────────────┴──────────────────────┘
        任一步 blocked，finalize 不能执行
```

**4. 确定性**

给定相同的文件系统快照，`capture status` 总是返回相同的输出。这是状态机的基本要求。

### 7.8 Agent 使用模式

Agent 不需要理解整个 capture 流程。它只需要：

```ts
while (true) {
  const status = await captureStatus(name);
  if (status.readyToFinalize) break;
  await execute(status.next.action, name);
}
```

状态机的复杂度被封装在 CLI 内部，Agent 看到的是简单的"当前状态 + 下一步动作"接口。

### 7.9 状态循环规则

Agent 每完成一个动作，**必须重新执行 `capture status` 获取最新状态**。禁止凭记忆推进。

Agent 执行 `capture new` 后，**必须先向用户汇报 `commandLibrarySnapshot` 中的查重结果和风险提示，获得用户确认后再进入状态驱动循环**。若用户拒绝，删除工作区并终止。

---

## 8. Skill 协议

### 8.1 `websculpt-capture/SKILL.md`

```markdown
# websculpt-capture

## 职责
把已验证的信息获取路径沉淀为 WebSculpt 命令资产。

## 入口
用户同意将 explore 结果沉淀为命令（或自行发起命令创建）。

## 协议

### 1. 创建工作区
基于 explore 的 Capture Assessment（或自行判断），执行：
```bash
websculpt capture new <name> --domain <d> --action <a> --runtime <r>
```

### 2. 立项汇报
根据 `capture new` 返回的 `commandLibrarySnapshot`，向用户汇报：
- 同 domain 命令列表
- 命名冲突及来源（user / builtin）
- 若冲突来源为 user，提示覆盖风险

请求用户确认是否继续推进。若用户拒绝，删除工作区并终止。

### 3. 状态驱动循环
反复执行 `websculpt capture status <name>`，按 `next` 推进：

| `next.action` | Agent 动作 | 参考文档 |
|--------------|-----------|---------|
| `fill-evidence` | 填写 evidence.md | references/capture/evidence-contract.md |
| `fill-command` | 实现 draft/command.js | references/compile/contract.md + runtime contract |
| `fill-readme` | 编写 draft/README.md | references/compile/contract.md |
| `fill-context` | 编写 draft/context.md | references/compile/contract.md |
| `validate` | 执行 `capture validate` | - |
| `request-user-confirmation` | 向用户展示摘要并确认 | - |

### 4. 安装
用户确认后：
```bash
websculpt capture finalize <name> [--force]
```

只有在用户明确允许覆盖已有 user command 时才使用 `--force`。如果冲突已经在 `capture new --force` 阶段确认，CLI 会继承该覆盖意图。

## 禁止
- 不得在 `capture status` 返回 blocked 时强行推进
- 不得在 evidence audit 通过前填写 draft
- 未获用户确认前不得执行 finalize
- `capture new` 后未获用户确认前不得进入状态驱动循环
```

### 8.2 `websculpt-explore/SKILL.md` 微调

确保 ExploreSession 的 `captureAssessment` 包含足够信息供 `capture new` 使用：

```yaml
captureAssessment:
  recommended: true
  candidateDomain: github
  candidateAction: list-trending
  runtime: browser
  reason: "页面结构稳定，可参数化 language 和 since"
  verifiedUrls:
    - "https://github.com/trending/python?since=daily"
  prerequisites: ["需要开启浏览器远程调试"]
```

Agent 在输出 Capture Assessment 后，**必须向用户简要说明沉淀建议并请求确认**，再建议进入 `websculpt-capture`。不要在用户未同意的情况下直接创建 capture 工作区。

---

## 9. 要修改的文件清单

### 9.1 文档（重写或大幅修改）

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/Progress.md` | 修改 | 更新为 3-skill 架构；删除 websculpt-compile 条目 |
| `docs/Architecture.md` | 修改 | 架构图改为 3 层 skill |
| `docs/Capture-Overview.md` | 重写 | 反映新设计（工作区结构、取消 capture draft/instructions） |
| `docs/Capture-CLI.md` | 重写 | 新 CLI 命令详细设计 |
| `docs/Capture-Skills.md` | 重写 | capture + compile 合并后的 skill 边界 |
| `skills/websculpt-capture/SKILL.md` | 重写 | 完整状态机协议 |
| `skills/websculpt-explore/SKILL.md` | 微调 | Capture Assessment 格式衔接 |
| `skills/websculpt-compile/SKILL.md` | 删除 | 内容迁移到 websculpt-capture |
| `skills/websculpt-capture/references/capture/evidence-contract.md` | 新建 | evidence 写作规范 |
| `skills/websculpt-capture/references/compile/` | 迁移 | 从 websculpt-compile 整体迁入 |

### 9.2 代码（新增 + 修改）

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/cli/meta/index.ts` | 修改 | 注册 `registerCaptureMeta` |
| `src/cli/meta/capture/index.ts` | 新建 | 注册 capture 子命令 |
| `src/cli/meta/capture/lib/capture-utils.ts` | 已新建 | 工作区路径、yaml 读写、命令库扫描 |
| `src/cli/meta/capture/new.ts` | 已新建 | `capture new` 命令实现 |
| `src/cli/meta/capture/lib/evidence-audit.ts` | 已新建 | Markdown 解析 + 三层 audit |
| `src/cli/meta/capture/lib/capture-status-computer.ts` | 已新建 | 文件系统状态机、manifest identity 检查、validation 指纹检查 |
| `src/cli/meta/capture/status.ts` | 已新建 | `capture status` 命令实现 |
| `src/cli/meta/capture/validate.ts` | 已新建 | `capture validate` 命令实现 |
| `src/cli/meta/capture/finalize.ts` | 已新建 | `capture finalize` 命令实现 |

---

## 10. 实施顺序

按依赖关系排序：

1. **`capture-utils.ts`**：工作区路径、yaml 读写、命令库扫描（无依赖）
2. **`evidence-audit.ts`**：Markdown 解析、标题检查、内容检查（无依赖）
3. **`new.ts`**：依赖 `capture-utils` + `draft-templates.ts`
4. **`status.ts`**：依赖 `capture-utils` + `evidence-audit`
5. **`validate.ts`**：依赖 `capture-utils` + `handleCommandValidate`
6. **`finalize.ts`**：依赖 `capture-utils` + `evidence-audit` + `handleCommandCreate`
7. **`index.ts`（capture）**：注册 4 个子命令
8. **修改 `src/cli/meta/index.ts`**：接入 capture
9. **同步更新文档**

---

## 11. 边界情况

| 场景 | 预期行为 |
|------|---------|
| `capture new` 时 user 命令已存在 | `COMMAND_ALREADY_EXISTS`（除非 `--force`） |
| `capture new` 时工作区已存在 | `CAPTURE_ALREADY_EXISTS`（除非 `--force`） |
| `capture new` 时 builtin 已存在 | 警告 `BUILTIN_OVERRIDE`，继续创建 |
| `capture status` 时工作区不存在 | `NOT_FOUND` |
| Agent 修改 evidence.md 标题 | `capture status` → `missing heading` → blocked |
| Agent 跳过 evidence 直接填 draft | `capture status` 中 draft 仍为 `blocked`（因 evidence 未完成） |
| `capture finalize` 时 evidence audit 失败 | `EVIDENCE_NOT_READY`，阻止安装 |
| `capture validate` 时 `draft/manifest.json` 与 `capture.yaml` 的 domain/action/runtime 不一致 | `VALIDATION_ERROR`，details 包含 `MANIFEST_MISMATCH`，并写入失败的 `validation.json` |
| `capture finalize` 时 validation.json 不存在 | `VALIDATION_NOT_FOUND` |
| `capture finalize` 时 validation.json 为失败 | `VALIDATION_FAILED` |
| `capture finalize` 时 draft 在成功 validate 后被修改 | `VALIDATION_STALE` |
| `capture finalize` 时 status 尚未 `readyToFinalize` | `DRAFT_NOT_READY` |
| `capture status` 时 `draft/manifest.json` 与 `capture.yaml` 的 domain/action/runtime 不一致 | manifest identity mismatch，command/manifest/readme/context/validation blocked，next 为 `fill-manifest` |
| `capture status` 时 `draft/manifest.json` 不是合法 JSON | manifest blocked，next 为 `fill-manifest` |
| README.md 或 context.md 仍包含任意 `TODO:` | 对应 artifact 为 `ready`，validation blocked |
| `capture new --force` 允许 user 命令冲突后执行 finalize | finalize 默认透传 overwrite 意图；也可显式传 `capture finalize <name> --force` |
| 跨 session 恢复 | 新 session 执行 `capture status`，按返回的 `next` 继续 |
| 用户拒绝 finalize | 工作区保留在 `.websculpt-captures/`，不安装到命令库 |

---

## 12. 与现有文档的关系

本文档生效后：
- **取代** `docs/Capture-Overview.md` 中的冲突内容
- **取代** `docs/Capture-CLI.md`
- **补充** `docs/Architecture.md` 和 `docs/Progress.md`
- `docs/Daemon.md` 不受影响
