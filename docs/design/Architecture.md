# WebSculpt 架构详解

> 本文档面向开发者和 Agent，回答"系统如何组织、各层职责边界、如何交互、代码在哪里"。是 [Design.md](Design.md) 的技术展开。

---

## 1. 架构总览

WebSculpt 由四层组成：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent                                    │
│  (reads docs, makes decisions, writes code, invokes CLI)            │
└─────────────────────────────────────────────────────────────────────┘
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐      ┌──────────────┐      ┌──────────────┐
│ access  │      │   explore    │      │   compile    │
│  约束层  │      │  策略层       │      │  规范层       │
└─────────┘      └──────────────┘      └──────────────┘
    │                                         │
    └─────────────────────┬───────────────────┘
                          ▼
                   ┌──────────────┐
                   │     CLI      │
                   │  交互与执行层  │
                   └──────────────┘
```

控制流详见 [Design.md](Design.md)：陌生场景由 AI 探索，探索结果被沉淀为命令资产，之后直接调用复用；异常时进入自愈闭环。

| 层级 | 本质 | 消费者 |
|------|------|--------|
| access | 工具的封装与行为约束 | AI / CLI runner |
| explore | 多工具配合的探索策略 | AI |
| compile | 命令资产的编写规范与校验 | AI（规范）/ CLI（校验器） |
| CLI | 经验沉淀框架的交互界面 | 人类用户 / AI |

---

## 2. access — 工具封装与约束层

### 2.1 定位

access 层不仅确保工具就绪，更要**约束 Agent 使用工具的行为**。Playwright CLI 等功能强大的工具，如果让 Agent 直接调用其全部底层 API，行为难以预测。access 层通过 `guide.md` 限定 Agent 可使用的命令范围、操作规范和风险提示，使 Agent 在受控边界内操作。

文档约束本身就是 Harness 的有效形式。是否以及何时需要代码层封装，取决于实际约束强度需求，不应将代码封装预设为唯一或最终形态。

### 2.2 做什么

- 为每个工具提供操作参考文档（`guide.md`），明确连接方式、可用命令、风险提示

### 2.3 不做什么

- 不预定义操作 API（如 `browser.click()`）——除非场景需要代码层约束
- 不做路由决策（"这个任务应该用哪个工具"）
- 不编排操作序列

### 2.4 目录结构

当前实际状态：

```
src/access/
  playwright-cli/
    guide.md             # Operation reference for Playwright CLI
```

每个工具子目录的最低要求：

```
src/access/<tool-name>/
  guide.md             # Required: connection, available commands, risk warnings
  index.ts             # Optional: additional tool-specific entry points
  ...                  # Tool-specific implementation files
```

新增工具时，在 `src/access/<工具名>/` 下创建子目录，至少包含 `guide.md`，然后在 `src/access/` 的总览文档中注册。

---

## 3. explore — 多工具配合策略层

### 3.1 定位

explore 层不仅指导"选哪个工具"，更指导"**如何组合多个工具完成复杂任务**"。例如：先用 `fetch` 探测页面结构，若遇反爬则切换至浏览器自动化，信息获取完成后用本地工具做数据清洗——这是一个多工具配合的流水线，explore 层应提供此类编排策略。

### 3.2 核心特征

explore 层不是代码层，不产生机器可消费的结构化日志。它的产出是 **AI 的决策依据**：

1. **可用工具清单** — 来自 access 层
2. **工具选择策略** — 何时用 fetch，何时启用浏览器自动化，何时调用 API
3. **操作优先级** — 先结构后交互、先轻后重等启发式规则
4. **多工具配合模式** — 常见任务的标准化工具编排方案

### 3.3 多工具配合模式

以下是 explore 层应覆盖的典型模式：

| 模式 | 工具链 | 适用场景 |
|------|--------|----------|
| 轻量探测 | `fetch` | 静态页面、API 端点、无反爬场景 |
| 深度交互 | `fetch` → `playwright-cli` | 需登录、动态渲染、反爬拦截 |
| 数据清洗 | `playwright-cli` → 本地 `node` 工具 | 抓取原始 HTML 后结构化提取 |
| 混合策略 | `fetch`（探测）→ `playwright-cli`（交互）→ `node`（处理） | 复杂信息收集流水线 |

这些是**参考资料**，不是代码强制执行的规则。AI 在具体场景中可覆盖它们。

### 3.4 启发式策略（可被覆盖）

- **先轻后重**：优先尝试 fetch，遇反爬或需交互再启用浏览器自动化
- **一手信息优先**：搜索引擎定位来源后，直接访问原始页面核实
- **先结构后交互**：进入页面后先用 `/eval` 探测 DOM，再决定是否需要 GUI 点击

### 3.5 目录结构

```
src/explore/
  README.md          # Comprehensive exploration strategy
```

explore 不产出结构化日志，也不管理会话生命周期。

---

## 4. compile — 规范与校验层

### 4.1 定位

c compile 层定义 WebSculpt 命令资产的编写规范，并通过校验器确保 AI 产出的命令在结构、合规性和契约上符合标准。

### 4.2 关键设计决策

**不暴露独立 CLI**

不设 `websculpt compile` 命令。`src/compile/` 目录仅包含：**规范文档** + **共享校验逻辑** + **运行时契约定义**。校验逻辑集成到 `command create` 中。

**"结构强制、逻辑自由"原则**

- **结构强制**：manifest 格式、导出签名、参数声明方式、禁止事项等由系统硬性约束
- **逻辑自由**：命令内部的具体实现（选择器、API 端点、交互序列）由 AI 根据探索结果自行编写

**无代码模板**

不预设可填空的代码模板，避免约束 AI 的创造力。仅通过规范文档明确各 runtime 的**签名契约**和**禁止事项**。

**测试由 AI 驱动**

系统不提供自动化测试框架或测试用例生成器。命令创建后，AI **自行调用** `websculpt <domain> <action>` 进行测试。AI 负责设计不同参数组合以验证正确性和泛化性。

### 4.3 当前状态

- `src/compile/` 目录尚未创建
- `command create` 内部仅含极简校验（如 `domain` 为 `command` 或 `config` 时返回 `RESERVED_DOMAIN` 错误）
- 完整的 L1-L3 校验分层设计、错误返回格式、待决事项详见 [CompileDesign.md](CompileDesign.md)

---

## 5. CLI — 经验沉淀框架的交互层

### 5.1 定位

CLI 不只是命令的发现、执行与管理入口，更是 Agent 将过去任务中探索出的经验**沉淀为可复用代码**，并在后续任务中**约束自身使用这些沉淀下来的代码**的系统。它是 Agent 的"外置记忆 + 行为约束层"，人类用户和 AI 共享同一套命令库界面。

### 5.2 命令分类与查找优先级

**命令分类**

| 分类 | 位置 | 说明 |
|------|------|------|
| **Meta（元命令）** | 系统内置 | 管理 CLI 本身和命令库，如 `config init`、`command list` |
| **Builtin（内置扩展命令）** | `src/cli/builtin/` | 随项目分发，作为默认能力或示例 |
| **User（用户自定义命令）** | `~/.websculpt/commands/` | 用户或 AI 创建的扩展命令，可覆盖 builtin |

**查找优先级**

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **User** — 最高优先级，允许覆盖同名的 builtin 命令
2. **Builtin** — 项目内置的默认实现
3. **Meta** — 系统保留，不可覆盖

关键规则：Meta 命令的保留词不会被 User 或 Builtin 覆盖；User 与 Builtin 的冲突以 User 为准。

**Registry Index**

CLI 启动时从 `~/.websculpt/registry-index.json` 加载命令清单，而非每次扫描目录树。Index 在首次启动、版本升级、`command create` 或 `command remove` 后自动重建；损坏或版本不匹配的 index 会被静默重建。所有运行时查询（`listAllCommands`、`findCommand`、`findCommandByHost`）均从内存缓存中同步读取。

### 5.3 命令资产格式

一个扩展命令（无论是 Builtin 还是 User）由两部分组成：

- `manifest.json`：描述命令的元数据（id、domain、action、description、参数列表、runtime 等）
  - `description` 为必填字段，不能为空字符串或仅含空白字符
- `command.js`：命令的实际执行逻辑，默认导出一个异步函数

目录结构：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  └── command.js
```

Builtin 命令的物理位置在 `src/cli/builtin/<domain>/<action>/`，结构与 User 命令一致。

`command create` 接收的 `CommandPackage`：

```ts
interface CommandPackage {
  manifest: CommandManifest;
  code: string;
  readme?: string;
  context?: string | Record<string, unknown>;
}
```

### 5.4 自愈闭环

命令失效时，系统不自动修复，而是触发 AI 主导的自愈流程：

```
命令失效
  -> 带着 explore 策略进行重新探索（AI 自主探索）
  -> AI 修复代码逻辑
  -> 经 compile 校验后通过 command create 重新落盘
```

异常检测标准、修复触发条件、命令版本策略均未设计。

### 5.5 与 compile 的关系

当前仅通过 `command.ts` 做极简校验，完整校验体系见 [CompileDesign.md](CompileDesign.md)。

### 5.6 与 access 的关系

执行依赖特定环境的命令（如 `playwright-cli` runtime）时，当前 `command-runner.ts` 直接调用工具。若环境未就绪，runner 通过错误关键词启发式识别并返回结构化错误（`PLAYWRIGHT_CLI_ATTACH_REQUIRED`）。

---

## 6. 运行时契约

WebSculpt 支持两种运行时，命令代码结构截然不同，AI 编写时必须区分：

| 维度 | `node` | `playwright-cli` |
|------|--------|------------------|
| 模块类型 | ESM 模块 | 函数体片段 |
| 入口签名 | `async (params)` | `async function (page)` |
| 参数方式 | 函数参数传入 | `/* PARAMS_INJECT */` 占位符替换 |
| 运行环境 | 完整 Node.js | 隔离上下文（无 Node.js API） |
| 浏览器 API | 不可用 | 通过 `page` 参数可用 |

详细编写规范、完整示例与检查清单见 [`docs/reference/WritingCommands.md`](../reference/WritingCommands.md)。

---

## 7. 目录规划与代码路径速查

### 7.1 项目目录

```
WebSculpt/
├── src/
│   ├── access/              # Tool encapsulation and behavioral constraints
│   │   └── playwright-cli/  # Playwright CLI guide.md
│   ├── explore/             # Exploration strategy documents
│   ├── compile/             # Command specification and validation (planned)
│   ├── cli/                 # CLI entry point and routing
│   │   ├── index.ts         # CLI assembly entry
│   │   ├── help.ts          # Custom help formatter and help routing
│   │   ├── domains.ts       # Dynamic domain command registration
│   │   ├── output.ts        # Result rendering utilities
│   │   ├── engine/          # Registry, runner, and execution orchestration
│   │   │   ├── registry.ts
│   │   │   ├── command-runner.ts
│   │   │   └── executor.ts
│   │   ├── meta/            # Meta command handlers and facade
│   │   │   ├── index.ts     # Registration facade
│   │   │   ├── command.ts
│   │   │   ├── config.ts
│   │   │   ├── create.ts
│   │   │   ├── skill.ts
│   │   │   └── validate.ts
│   │   └── builtin/         # Built-in extension commands
│   │       ├── example/hello/
│   │       └── zhihu/author-posts/
│   ├── types/               # Shared TypeScript types
│   └── infra/               # Infrastructure utilities
├── skills/websculpt/        # Agent skill deliverables
├── tests/                   # Test suites
├── openspec/                # OpenSpec workflow
└── dist/                    # Build output
```

### 7.2 用户目录

```
~/.websculpt/
├── commands/                # User-defined extension commands
├── config.json              # User configuration
├── log.jsonl                # Execution log
└── registry-index.json      # Persistent registry index (cached command manifests)
```

### 7.3 关键代码路径

| 用途 | 路径 |
|------|------|
| CLI 入口 | `src/cli/index.ts` |
| 帮助格式化与路由 | `src/cli/help.ts` |
| 动态域命令注册 | `src/cli/domains.ts` |
| 命令注册与查找 | `src/cli/engine/registry.ts` |
| 命令执行器 | `src/cli/engine/command-runner.ts` |
| 执行编排（计时、日志、错误处理） | `src/cli/engine/executor.ts` |
| 元命令门面 | `src/cli/meta/index.ts` |
| 命令创建 | `src/cli/meta/create.ts` |
| 公共类型 | `src/types/index.ts` |
| Playwright CLI 操作参考 | `src/access/playwright-cli/guide.md` |
| 运行时契约文档 | `docs/reference/WritingCommands.md` |
| compile 设计草案 | `docs/design/CompileDesign.md` |
