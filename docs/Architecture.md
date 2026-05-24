# WebSculpt 架构详解

> 本文档面向开发者，描述 WebSculpt 的架构设计、运行时模型与目录规划。

---

## 1. 架构总览

WebSculpt 的核心设计目标是将"信息获取路径"沉淀为本地可复用的命令资产。整个系统围绕 **explore → capture → command** 的三阶段闭环运转：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent                                    │
│  (理解需求、探索路径、沉淀资产、调用命令)                              │
└─────────────────────────────────────────────────────────────────────┘
    │                              │
    ▼                              ▼
┌──────────────┐           ┌──────────────┐
│   explore    │  ──────►  │   capture    │
│  发现与验证   │  交接    │  沉淀与固化   │
└──────────────┘           └──────────────┘
    ▲                              │
    │                              ▼
    │                      ┌──────────────┐
    └─────────────────────│    command   │
       复用已有命令       │  执行与复用   │
                          └──────────────┘
                                   │
                                   ▼
                          ┌──────────────┐
                          │     CLI      │
                          │  交互与调度层  │
                          └──────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                ┌──────┐     ┌────────┐     ┌──────────┐
                │ node │     │browser │     │shell/py  │
                └──────┘     │(daemon)│     └──────────┘
                             └────────┘
```

| 阶段 | 职责 | 对应 Skill | 产出 |
|------|------|-----------|------|
| explore | 完成信息获取任务，发现可复用路径；优先复用命令库，必要时使用外部工具 | `websculpt-explore` | 探索结果 + Capture Assessment |
| capture | 将验证过的路径固化为命令资产，经状态机推进和硬门槛校验后安装 | `websculpt-capture` | 安装到命令库的 `domain/action` 命令 |
| command | 被 CLI 发现、调度、执行；用户和 Agent 通过同一界面调用 | — | 结构化 JSON 输出 |

CLI 是这三个阶段的统一入口：它既提供 `capture` 工作流管理沉淀过程，也提供 `command` 管理命令库，同时作为扩展命令的执行引擎。

---

## 2. Explore 阶段

### 2.1 定位

explore 是信息获取的**发现与验证层**。其核心职责是：

- **优先复用**：先检查命令库中已沉淀的信息获取路径，避免重复消耗 Token。
- **按需探索**：无可用路径时，通过外部工具探索并验证新路径，保留失败信号。
- **交接评估**：交付结果时评估路径是否值得沉淀，将候选交接给 capture 阶段。

explore 阶段**不创建命令资产**，只负责发现和评估。

### 2.2 Skill 交付物

`skills/websculpt-explore/` 包含：

- `SKILL.md`：探索协议、查库与选工具规则、trace.md 填写规范、explore assess 审计要求。
- `references/access/playwright-cli-guide.md`：当 Agent 需要直接操作浏览器进行探索时的操作参考。

### 2.3 关键机制

- **强制查库**：每次进入 explore 必须先执行 `websculpt command list`，将结论写入 `trace.md` 的 `Library Check`。
- **逐步确认**：对候选命令从轻到重逐步确认适用性（`--help` → `command show` → `command show --include-readme`）。
- **浏览器前置检查**：若需直接操作浏览器，必须先阅读 `playwright-cli-guide.md`，并在 `trace.md` 的 `Protocol` 中记录。
- **Assessment 结构化**：`trace.md` 的 `## Assessment` 包含 8 个强制 H3 子节（Scenario, Candidate, Runtime, Parameters, Output Schema, Command Library Relation, Prerequisites, Confirmation）。
- **CLI 硬约束**：`explore assess` 执行 L1/L2/L3 三层 Markdown 审计和 H3 子节完整性检查，未通过前禁止进入 capture。

---

### 2.4 工作区结构

Explore 工作区位于**项目当前目录**下：

```text
.websculpt/
└── explores/
    └── <name>/
        ├── explore.yaml    # 元数据 + 审计结果（创建时写入，assess 时更新）
        └── trace.md        # 探索痕迹（Agent 填写，assess 审计）
```

`explore.yaml` 记录工作区身份、探索意图和最后一次 `assess` 的结果（`status`、`captureEligible`、`candidate`）。`trace.md` 使用 5 个强制 H2 标题（Library Check / Tool Trace / Protocol / Verified Sources / Assessment），其中 Assessment 在提出候选时必须包含 8 个 H3 子节。

---

## 3. Capture 阶段

### 3.1 定位

capture 是在"探索路径"与"正式命令资产"之间引入的**轻量工作区**。Agent 完成探索后，不直接落盘为命令，而是进入一个受检查、可恢复、可审计的沉淀过程。

核心职责：

- **固化证据**：`evidence.md` 记录探索路径、已验证 URL、选择器、失效信号等。
- **状态机驱动**：Agent 不需要理解完整流程，只需循环执行 `capture status` 并按返回的 `next.action` 推进。
- **硬门槛安装**：只有证据、代码、文档、校验全部通过后，才能通过 `capture finalize` 进入命令库。

### 3.2 工作区结构

工作区位于**项目当前目录**下：

```text
.websculpt/
└── captures/
    └── <name>/
        ├── capture.yaml      # 机器可读元数据 + 命令库快照（创建时写入，后续只读）
        ├── evidence.md       # 探索证据（Agent 填写，系统审计）
        ├── draft/            # 命令包骨架
        │   ├── manifest.json
        │   ├── command.js
        │   ├── README.md
        │   └── context.md
        └── validation.json   # 最近一次 validate 结果（含 draft 指纹）
```

### 3.3 核心设计概念

**六 Artifact 流水线**

Capture 工作流由 6 个 artifact 按严格分层依赖推进：

```text
evidence → command → manifest → readme → context → validation
```

每个 artifact 必须等待前序达到完成状态才能离开阻塞态；若前序回退，后续立即连锁回退。

**纯函数式状态机**

`capture status` 每次调用重新读取文件系统，根据扫描结果计算当前状态和下一步动作，不维护任何内存持久状态。这使得 Agent 可以任意修改文件，跨 session 的陌生 Agent 也能通过一次调用获知当前进度。

**Evidence Audit**

对 `evidence.md` 执行三层 Markdown 审核：L1/L2 为硬门槛，L3 为软规则。防止 Agent 跳过证据记录直接写代码。

**Validation Fingerprint**

校验通过后计算 draft 的 SHA256 指纹并写入 `validation.json`，后续修改 draft 会导致指纹失效并阻断 finalize，防止"验证通过后偷改代码"的绕过行为。

**Finalize 硬门槛**

安装必须同时满足 validation 成功、指纹未失效、evidence 审核通过、全部 artifact 完成四个条件。所有门槛不满足时均返回明确错误码，不会静默降级。

> 各机制的详细规则、状态转移函数和判定链见 [`Capture.md`](./Capture.md)。


### 3.4 Skill 交付物

`skills/websculpt-capture/` 包含：

- `SKILL.md`：capture 协议、CaptureSession 状态机、4 组测试要求、修复循环规则。
- `references/node-contract.md` / `browser-contract.md`：按 runtime 的命令编写契约。

---

## 4. Command 阶段

### 4.1 定位

command 是可复用的信息获取工作流，封装了"如何从特定网站或 API 获取信息"的逻辑。首次由 AI 探索沉淀，后续直接复用，无需重复消耗 Token。

命令分为两类：

- **Builtin（内置扩展命令）**：位于 `src/cli/builtin/`，随项目分发。
- **User（用户自定义命令）**：位于 `~/.websculpt/commands/`，可覆盖 builtin，使系统可进化。

### 4.2 命令包结构

```text
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json    # 元数据：描述、运行时、参数列表
  ├── command.js       # 执行逻辑（或 runtime 对应入口）
  ├── README.md        # 面向调用者的文档
  ├── context.md       # 面向修复者的上下文
  └── evidence.md      # 探索证据（capture 路径 finalize 时复制，路径 A 无此文件）
```

Builtin 命令的物理位置在 `src/cli/builtin/<domain>/<action>/`，结构与 User 命令一致。

### 4.3 创建路径

扩展命令可通过两条路径创建：

| 路径 | 命令系列 | 草稿位置 | 特点 |
|------|---------|---------|------|
| **A：直接创建** | `command draft / validate / create` | `.websculpt-drafts/` | 人工编写或脚本化场景，自主控制流程 |
| **B：沉淀工作流** | `capture new / status / validate / finalize` | `.websculpt/captures/<name>/draft/` | Agent 驱动，额外要求 `evidence.md` 和状态机推进；底层复用 `command` 的校验与安装能力，增加 evidence 审计和 draft 指纹防篡改 |

路径 B 在 finalize 时底层调用与路径 A 相同的安装逻辑，但增加了前置门槛。

### 4.4 分层校验

无论哪条路径，`command create` 和 `capture finalize` 落盘前均强制执行 L1-L3 分层校验：

| 层级 | 范围 |
|------|------|
| L1 结构 | manifest 字段与类型 |
| L2 合规 | 禁止使用的代码模式 |
| L3 契约 | 代码结构与 manifest 的一致性 |

---

## 5. CLI 层

### 5.1 定位

CLI 是命令的发现、管理与生命周期入口，面向人类用户和 AI 提供同一套界面。

- **Meta 命令**：管理 CLI 本身和命令库。包括 `command`、`config`、`daemon`、`explore`、`scope`、`skill`、`capture`。
- **扩展命令**：可复用的信息获取工作流。Meta 不可被覆盖，防止扩展命令破坏核心管理能力。

### 5.2 查找优先级

当输入 `websculpt <domain> <action>` 时：

1. **User** — 最高优先级，允许覆盖同名的 builtin 命令
2. **Builtin** — 项目内置的默认实现

Meta 命令在系统层面直接注册，不参与扩展命令扫描。

### 5.3 Skill 管理

CLI 提供 `skill install / uninstall / status` 元命令，将项目内置的 skills 安装到各 Agent 的目录（`.claude/skills/`、`.codex/skills/`、`.agents/skills/` 等）。

- 默认 local scope，自动扫描当前目录下已存在的 agent 目录。
- 支持 `--global` 安装到全局 agent 目录。
- 支持 `--lang en/zh` 切换语言版本。

---

## 6. 运行时与执行后端

WebSculpt 当前支持四种运行时：

| 运行时 | 执行方式 | 状态 |
|--------|---------|------|
| **`node`** | CLI 进程直接动态导入命令模块，在同进程内完成执行 | 已完全可用 |
| **`browser`** | 由 WebSculpt 自建的后台 daemon 进程执行，CLI 通过 IPC 转发任务 | 已完全可用 |
| **`shell`** | 命令包生命周期（draft、validate、create）已支持，CLI 执行引擎尚未接入 | 仅创建/校验 |
| **`python`** | 同上 | 仅创建/校验 |

> **注意**：`browser` 在这里是**运行时名称**，表示命令需要浏览器环境；它与 `@playwright/cli` npm 包（Agent 探索阶段使用的 CLI 工具）在架构上完全独立。daemon 内部直接使用 `playwright-core` 连接浏览器，不依赖 `@playwright/cli` 包的进程或会话管理。

daemon 集中管理浏览器资源，负责内存监控、执行次数阈值触发自动重启、metrics 与日志持久化。详见 [`Daemon.md`](./Daemon.md)。

---

## 7. 目录规划

### 7.1 项目目录

```
WebSculpt/
├── src/
│   ├── cli/                    # 入口、引擎、Meta 命令、内置命令、校验器
│   │   ├── engine/             # 命令发现与执行调度
│   │   ├── meta/               # 元命令实现与共享逻辑
│   │   │   ├── capture/        # capture 工作流
│   │   │   ├── command/        # 命令管理
│   │   │   ├── explore/        # explore 工作流
│   │   │   └── lib/            # 元命令共享逻辑
│   │   ├── builtin/            # 内置扩展命令
│   │   ├── runtime/            # 运行时规范化
│   │   └── types/              # CLI 内部类型
│   ├── daemon/                 # 后台浏览器执行进程
│   │   ├── client/             # IPC 客户端、生命周期管理、状态持久化
│   │   ├── server/             # 浏览器管理与任务执行后端
│   │   └── shared/             # 协议定义与跨进程共享路径
│   ├── types/                  # 跨层共享 TypeScript 类型定义
│   └── infra/                  # 基础设施工具：用户目录路径、配置与日志读写
├── skills/                     # Agent skill 交付物
│   ├── websculpt-explore/      # 探索阶段 skill（含 access 参考）
│   └── websculpt-capture/      # 沉淀阶段 skill（含编写契约）
├── openspec/                   # OpenSpec 变更管理
├── tests/                      # 测试套件（CLI 引擎、Meta 命令与 daemon）
│   ├── e2e/
│   ├── integration/
│   └── unit/
├── docs/                       # 文档
└── dist/                       # 构建输出
```

### 7.2 项目级工作区目录

WebSculpt 在当前项目根目录维护 `.websculpt/`，存放项目相关的本地数据：

```text
./.websculpt/
├── scope.json         # 项目级命令可见性白名单
├── explores/          # explore 工作区
└── captures/          # capture 工作区
```

explore 和 capture 工作区的详细结构见 §2.4 和 §3.2。

---

### 7.3 用户目录

```
~/.websculpt/
├── commands/                # 用户自定义扩展命令
├── config.json              # 用户配置
├── log.jsonl                # 扩展命令执行日志
├── audit.jsonl              # 命令安装/覆盖审计日志
├── registry-index.json      # 持久化注册表索引（命令 manifest 缓存）
├── daemon.json              # daemon 进程状态（PID、socket 路径）
├── daemon.log               # daemon 运行日志
└── daemon-metrics.json      # daemon 会话汇总指标
```
