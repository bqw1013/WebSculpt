# WebSculpt Capture 设计概览

> 本文档面向开发者和高级用户，说明 Capture 工作流的设计意图、核心概念与关键机制。命令用法和参数细节见 [`CLI.md`](./CLI.md)。

---

## 1. 定位与边界

### 1.1 Capture 是什么

Capture 是在"探索路径"与"正式命令资产"之间引入的一个**轻量工作区**。Agent 完成信息获取后，不直接落盘为命令，而是先进入一个受检查、可恢复、可审计的沉淀过程。

它的核心职责：

- **固化证据**：`evidence.md` 记录探索路径、已验证 URL、选择器、失效信号等，是跨 session 的唯一桥梁。
- **状态机驱动**：Agent 不需要理解完整流程，只需循环执行 `capture status` 并按返回的 `next.action` 推进。
- **硬门槛安装**：只有证据、代码、文档、校验全部通过后，才能通过 `capture finalize` 进入命令库。

### 1.2 创建路径

WebSculpt 支持三种创建或重建扩展命令的方式，最终安装到同一位置（`~/.websculpt/commands/<domain>/<action>/`），命令包结构也完全一致：

| 路径 | 命令 | 适用场景 |
|------|------|----------|
| **直接创建** | `command draft / validate / create` | 人工编写、脚本化、已知明确需求 |
| **沉淀工作流** | `capture new / status / validate / finalize` | Agent 驱动，从零开始沉淀新命令 |
| **反向导入** | `capture import / status / validate / finalize` | 修改或维护已有命令，保留原始证据和上下文 |

Capture 路径（含 `new` 和 `import`）底层复用了 `command validate` 和 `command create` 的能力，额外增加了 evidence 审计和 draft 指纹防篡改。

### 1.3 与 Explore 的关系

Explore 必须能独立使用（用户只要数据、不要沉淀）。只有当用户明确同意将 explore 结果沉淀为命令时，才进入 Capture 工作流。

进入 Capture 的前提是对应 explore 工作区已通过 `explore assess` 审计（返回 `status: passed`），其中 `trace.md` 的 `### Confirmation` 已记录用户决策。

---

## 2. 工作区结构

工作区位于**项目当前目录**下：

```text
.websculpt/
└── captures/
    └── <name>/
        ├── capture.yaml      # 机器可读元数据 + 命令库快照（创建时写入，后续只读）
        ├── evidence.md       # 探索证据（Agent 填写，系统审计）
        ├── draft/            # 命令包骨架（capture new 一并生成）
        │   ├── manifest.json # 预填 domain/action/runtime，id 留空
        │   ├── command.js    # 运行时对应入口模板
        │   ├── README.md     # 模板
        │   └── context.md    # 模板
        ├── validation.json   # 最近一次 validate 结果（含 draft 指纹）
        └── backup/           # capture import 时写入的原命令快照，用于 capture restore 回滚
```

**设计意图**：

- `capture.yaml` 不存状态，只存身份声明和客观查重数据。状态由 `capture status` 每次实时计算。
- `evidence.md` 与 `draft/` 分离，确保"为什么要做"和"怎么做"有清晰的物理边界。
- `validation.json` 作为外部动作（`capture validate`）的持久化凭证，供状态机和 finalize 查验。

---

## 3. 核心设计概念

### 3.1 六 Artifact 流水线

Capture 工作流由 6 个 artifact 组成，按严格分层依赖推进：

```text
evidence (done)
    |
    v
command (ready / done / blocked)
    |
    v
manifest (ready / done / blocked)
    |
    v
readme (ready / done / blocked)
    |
    v
context (ready / done / blocked)
    |
    v
validation (blocked / done)
```

每个 artifact 必须等待前序 artifact 达到 `done` 才能离开 `blocked`。如果前序回退（例如 evidence 标题被删、TODO 被重新添加），后续会立即连锁回退。

三个状态含义：

- `blocked`：前置条件不满足，无法推进
- `ready`：前置条件已满足，但内容仍是模板（如含 TODO marker）
- `done`：内容已实质完成

### 3.2 纯函数式状态机

`capture status` 是一个**纯函数式状态机**：每次调用都重新读取文件系统，根据扫描结果计算当前状态和下一步动作，不维护任何内存中的持久状态。

带来的性质：

- **Agent 可以随意修改文件**，`capture status` 永远返回最新真相
- **跨 session 安全**：新 session 的陌生 Agent 只需执行 `capture status <name>`，就能知道当前该做什么
- **确定性**：给定相同的文件系统快照，输出永远相同

状态机的具体转移函数和判定链由 CLI 内部实现维护。

### 3.3 `capture status` 驱动模式

Agent 不需要理解整个 capture 流程。它只需要：

```text
循环：
  执行 capture status <name>
  如果 readyToFinalize == true，跳出循环
  按 next.action 执行对应动作
```

`next.action` 的取值范围固定为：

- `fill-evidence` → 编辑 `evidence.md`
- `fill-command` → 实现入口文件
- `fill-manifest` → 填写 `manifest.json`
- `fill-readme` → 编写 `README.md`
- `fill-context` → 编写 `context.md`
- `validate` → 执行 `capture validate <name>`
- `finalize` → 所有 artifact 已完成，准备执行 `capture finalize`

这一层抽象把状态机的复杂度封装在 CLI 内部，Agent 看到的是简单的"当前状态 + 下一步动作"接口。

---

## 4. 关键机制

### 4.1 Evidence Audit

Evidence 是对 `evidence.md` 的三层 Markdown 审核。

| 层级 | 检查内容 | 是否阻断 |
|------|----------|----------|
| **L1 结构** | 5 个必需 H2 标题是否精确存在 | 是 |
| **L2 内容** | 每个 H2 下是否有实质内容（非空、非注释、非标题） | 是 |
| **L3 关键词** | browser 运行时是否提到 `guide.md`、是否有 `http(s)://` | 否，仅 warning |

**设计理由**：

- L1/L2 是硬门槛，防止 Agent 跳过证据记录直接写代码。
- L3 是软规则，因为字符串匹配容易产生误报，不应阻断正常流程。
- 5 个标题（Exploration Path / Verified URLs / Structural Evidence / Failure Signals / Capture Assessment）被固定，Agent 不得修改，确保跨 session 可解析。

### 4.2 Validation Fingerprint

`capture validate <name>` 成功后，会计算当前 draft 文件的 SHA256 指纹并写入 `validation.json`。

指纹覆盖范围：

- `capture.yaml` 的 `domain` / `action` / `runtime`（作为 salt）
- `draft/manifest.json`
- 运行时入口文件
- `draft/README.md`
- `draft/context.md`

**设计理由**：

防止"验证通过后偷改代码"的绕过行为。如果 Agent 在 `validate` 成功后又修改了 draft，`capture status` 会让 `validation` 回退到 `blocked`，`capture finalize` 会返回 `VALIDATION_STALE`。

这一机制把"校验通过"从一次性动作变成与文件内容绑定的持续断言。

---

## 5. Finalize 硬门槛

`capture finalize` 是状态机的唯一出口，必须同时满足以下条件才能安装：

1. `validation.json` 存在且 `success === true`
2. `validation.json` 中的指纹与当前 draft 指纹一致（未 stale）
3. `evidence.md` 通过 audit（L1 + L2）
4. `capture status` 返回 `readyToFinalize === true`（即 6 个 artifact 全部 `done`）

所有门槛不满足时均返回明确的错误码，不会静默降级。

安装成功后，`evidence.md` 会被复制到命令目录，即使后续清理工作区，证据档案仍然保留。

此外，若当前工作目录或其祖先目录存在 active scope，`capture finalize` 会自动将新命令追加到该 scope 的白名单中。此步骤为 best-effort：追加失败不会阻断 finalize 本身。

---

## 6. Restore 回滚

`capture restore <workspace-name>` 用于撤销一次 maintain 尝试，将命令库恢复到 `capture import` 执行时的状态。

它只作用于通过 `capture import` 创建的工作区，因为：

- 导入时会把解析到的原命令完整复制到工作区根目录的 `backup/`。
- `capture.yaml` 会记录 `sourceType`（`user` 或 `builtin`），用于决定回滚语义。

回滚语义：

| `sourceType` | 行为 |
|--------------|------|
| `user` | 删除 `~/.websculpt/commands/<domain>/<action>/`，然后用 `backup/` 重新创建该目录 |
| `builtin` | 删除 `~/.websculpt/commands/<domain>/<action>/`（如果存在），使 builtin 命令重新生效 |

Restore 成功后系统会重建命令索引。常见错误码：

- `NOT_FOUND`：工作区不存在
- `WORKSPACE_NOT_RESTORABLE`：工作区缺少 `sourceType`（通常不是由 `capture import` 创建）
- `BACKUP_NOT_FOUND`：工作区缺少 `backup/` 目录

`restore` 不会清理工作区本身的 draft 或 validation 记录；Agent 可以基于当前 draft 继续修复，或手动清理工作区。

---

## 7. 边界与限制

- `capture new` 时若 builtin 命令已存在，发出 `BUILTIN_OVERRIDE` 警告但允许继续；若 user 命令已存在，默认阻断，可用 `--force` 覆盖。
- `capture import` 要求被导入命令必须包含 `evidence.md`，否则报错 `EVIDENCE_MISSING`。没有证据的命令无法进入状态机，需通过 `capture new` 从头创建。
- `capture restore` 只能用于由 `capture import` 创建且包含 `backup/` 和 `sourceType` 的工作区。
- `shell` 和 `python` 运行时的命令包生命周期（draft / validate / create）已支持，但 CLI 执行引擎尚未接入，创建时会附带 `RUNTIME_NOT_EXECUTABLE` 警告。
- 工作区保留在项目目录的 `.websculpt/captures/` 中，不是用户目录；Agent 应在用户拒绝 finalize 后自行决定是否清理。
