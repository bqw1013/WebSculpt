# WebSculpt Compile 层设计草案

> 本文档记录 compile 层的设计目标与规划，供后续实现参考。
> 当前 `src/compile/` 目录仅包含规范文档，共享校验逻辑位于 `src/cli/meta/`。以下内容为设计方向而非已实现状态。

---

## 1. 项目背景

WebSculpt 是一个基于 Harness Engineering 理念的信息获取框架，核心命题是：

> 用确定性的执行层去组织 AI 在信息收集上的概率性能力。

其控制流为：

```
陌生场景 ──AI 探索──▶ 沉淀命令 ──直接调用──▶ 多次复用
    ^                                      |
    └──────── 异常检测 / AI 修复 ──────────┘
```

---

## 2. 三层架构与 Compile 的定位

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI AGENT                                    │
│  (reads docs, makes decisions, writes code, invokes CLI)            │
└─────────────────────────────────────────────────────────────────────┘
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐      ┌──────────────┐      ┌──────────────┐
│ access  │      │   explore    │      │   compile    │
│  工具层  │      │  策略层       │      │  规范层       │
│         │      │              │      │              │
│ playwright/│   │ 综合策略文档   │      │ 命令编写规范   │
│         │      │ 工具选择倾向   │      │ 运行时契约定义 │
└─────────┘      └──────────────┘      └──────────────┘
```

- **access**：通过文档约束确保基础设施就绪（Playwright CLI 等），提供各工具的操作参考文档。
- **explore**：策略文档层。一个（或多个）Markdown 文件，告诉 AI 面对不同场景时应该优先用什么工具、遵循什么策略。具体工具如何使用，AI 阅读 access 层各子目录的 README。
- **compile**：命令工厂规范层。告诉 AI "探索完成后，如何把结果写成 WebSculpt 认可的命令"。

**关键设计决策**：compile **不暴露独立 CLI 命令**，且**不放置代码文件**。它是一个由"规范文档 + 运行时契约定义"组成的纯文档层。校验逻辑由 `src/cli/meta/command-validation.ts` 提供，供 `command create` 和 `command validate` 复用。

---

## 3. 当前代码库现状

### 3.1 已落地的基础设施

| 模块 | 路径 | 状态 |
|------|------|------|
| CLI 入口与路由 | `src/cli/index.ts` | 已落地（纯装配层） |
| 帮助格式化与路由 | `src/cli/help.ts` | 已落地 |
| 动态域命令注册 | `src/cli/domains.ts` | 已落地 |
| 命令注册与查找 | `src/cli/engine/registry.ts` | 已落地 |
| 命令执行器 | `src/cli/engine/command-runner.ts` | 已落地（支持 `node`、`playwright-cli`） |
| 执行编排（计时、日志、错误处理） | `src/cli/engine/executor.ts` | 已落地 |
| 元命令门面 | `src/cli/meta/index.ts` | 已落地 |
| 命令创建 | `src/cli/meta/create.ts` | 已落地（支持 `--from-dir`） |
| 命令预检 | `src/cli/meta/validate.ts` | 已落地 |
| 共享校验逻辑 | `src/cli/meta/command-validation.ts` | 已落地（L1-L3 + 产物完整性检查） |
| 公共类型 | `src/types/index.ts` | 已落地（`CommandManifest`、`CommandRuntime`、`CommandResult` 等） |
| access / playwright-cli | `src/access/playwright-cli/guide.md` | 仅文档约束 |
| compile / 规范文档 | `src/compile/README.md` | 尚未创建 |

### 3.2 命令资产格式

沉淀产物以多文件目录形式存在。

**AI 工作区（草稿态）**：

AI 将命令写入任意 staging 目录：

```
.staging/zhihu-articles/
  ├── manifest.json      # 命令元数据（必填）
  ├── command.js         # 执行逻辑（必填，runtime 决定扩展名）
  ├── README.md          # 使用说明（建议提供）
  └── context.md         # 修复上下文（强烈建议提供）
```

**命令库（正式档案）**：

`create` 校验通过后写入用户目录：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js
  └── ...（同 staging 结构）
```

**`manifest.json` 字段**：

```typescript
interface CommandManifest {
  id?: string;                   // 系统维护字段，格式 ${domain}-${action}；由 command create 自动注入
  domain?: string;               // 系统维护字段，由 command create 自动注入
  action?: string;               // 系统维护字段，由 command create 自动注入
  runtime?: CommandRuntime;      // "node" | "shell" | "python" | "playwright-cli"，省略时默认为 "node"
  parameters?: Array<{
    name: string;
    required?: boolean;
    default?: string | number | boolean;
    description?: string;
  }>;
  // outputSchema 已于 2026-04-23 从类型中移除，当前无 schema 校验
}
```

`id` / `domain` / `action` 由 `command create` 根据 CLI 参数强制注入，AI 在草稿阶段无需填写；若 manifest 中已存在且不一致，以 CLI 参数为准。

**`command create` 接口**：

```bash
websculpt command create <domain> <action> --from-dir <path> [--force]
```

- `<path>` 指向包含上述文件的目录
- `--force`：覆盖已存在的同名命令

### 3.3 Runtime 执行契约

**`node` runtime**：

- 入口文件：`command.js`（或 runtime 对应的扩展名）
- 标准 ESM 模块，导出异步函数（优先 `export default`，亦支持 `export const command = ...`）
- 签名：`async (params: Record<string, string>) => unknown`
- 参数由 runner 直接传入，**不需要** `/* PARAMS_INJECT */`
- **不要**在代码中写 `|| default` 形式的参数 fallback（runner 已根据 manifest 填充默认值，避免 `--limit 0` 被误判为 falsy）
- 直接 `return result`，由 `command-runner.ts` 消费
- 完整 Node.js 环境可用（`fs`、`path`、`fetch`、`console` 等）

**`playwright-cli` runtime**：

- 入口文件：`command.js`
- **不是 ESM 模块**，而是一个函数体片段（被 `playwright-cli run-code` 包裹执行）
- 签名：`async function (page) { ... }`
- **必须包含** `/* PARAMS_INJECT */` 占位符，由 `command-runner.ts` 在运行时替换为 `const params = {...};`
- 通过 `return result` 输出结果，`playwright-cli` 将其提取为 stdout 中的 `### Result\n<json>`
- **命令内部禁止包含 CDP attach 逻辑**（`connect`、`connectOverCDP` 等），浏览器连接由 access 层外部管理

> **注意**：两种 runtime 的代码结构完全不同（模块 vs 函数体），AI 编写时必须区分。

---

## 4. 已确定的设计决策

### 4.1 Compile 层不暴露 CLI

- 不设 `websculpt compile` 命令。
- `src/compile/` 目录仅包含：**规范文档** + **运行时契约定义**，不放置代码文件。
- 共享校验逻辑由 `src/cli/meta/command-validation.ts` 提供。

### 4.2 "结构强制、逻辑自由"原则

- **结构强制**：manifest 格式、导出签名、参数声明方式、禁止事项等由系统硬性约束。
- **逻辑自由**：命令内部的具体实现（选择器、API 端点、交互序列）由 AI 根据探索结果自行编写。

### 4.3 无代码模板

- 不预设可填空的代码模板，避免约束 AI 的创造力。
- 仅通过规范文档明确各 runtime 的**签名契约**和**禁止事项**。

### 4.4 测试由 AI 驱动

- 系统不提供自动化测试框架或测试用例生成器。
- 命令创建后，AI **自行调用** `websculpt <domain> <action>` 进行测试。
- AI 负责设计不同参数组合以验证正确性和泛化性。
- `command create` 成功后，命令立即可被调用。

### 4.5 playwright-cli 命令的环境依赖处理

- node runtime 命令可直接测试。
- playwright-cli runtime 命令需要浏览器环境（CDP 连接）。
- 如果用户未开启远程调试，`command-runner.ts` 应返回**结构化错误**（而非模糊的 exec 错误），AI 据此向用户发出明确提示。
- 用户完成设置后，AI 再次调用命令继续测试，无需重新创建命令。

### 4.6 `command create` 只支持 `--from-dir`（已实现）

不设 `--from-file`。沉淀工作流中命令资产始终为多文件目录形态。

`handleCommandCreate` 已提取至 `src/cli/meta/create.ts`，支持从 staging 目录读取 `manifest.json`、entry file、`README.md` 和 `context.md`，校验保留域保护和文件完整性后落盘。

**注入规则**：落盘前，系统以 CLI 参数 `<domain>` 和 `<action>` 为权威，强制覆盖 manifest 中的 `domain`、`action` 字段，并注入 `id = "${domain}-${action}"`。AI 在草稿阶段无需填写这三个字段；若 manifest 中已存在且不一致，以 CLI 参数为准。

### 4.7 `validate` 独立预检命令

除 `create` 内置强制校验外，提供独立命令用于预检：

```bash
websculpt command validate --from-dir <path> [domain] [action]
```

- 与 `create` 共享 `command-validation.ts` 的校验逻辑
- 只校验，不落盘
- 返回结构化校验结果，供 AI 调试

**行为区分**：
- **不带 `[domain] [action]`**：校验 manifest 内部自洽性 + L2 合规 + L3 契约。`id`/`domain`/`action` 缺失时发 `warning`（因为 `create` 会注入）。
- **带 `[domain] [action]`**：额外校验注入后的完整状态（含 `id`/`domain`/`action` 一致性），模拟 `create` 的落盘预览。

### 4.8 `context` 统一为 Markdown 字符串（已实现）

`context.md` 的内容作为字符串存入系统，类型统一为 `string`，不再支持 `Record<string, unknown>`。

落盘时直接复制 `context.md` 的原始文本内容，不做 JSON 包装。

### 4.9 不引入 `pack` 命令

无需将多文件打包为 JSON 的中间环节。`create --from-dir` 直接消费目录。

### 4.10 `parameters` 统一为对象数组（已实现）

`CommandManifest.parameters` 类型从 `(string | CommandParameter)[]` 收窄为 `CommandParameter[]`，不再支持字符串 shorthand。

原因：
- 字符串 shorthand（如 `"title"`）增加了 runner 和 CLI option 构建时的分支复杂度
- 对象形式显式声明 `description`、`required`、`default`，对 AI 编写和后续消费更友好
- 所有现有 builtin 命令和测试均已迁移为对象形式

---

## 5. 校验分层设计（L1-L3）

`command create` 落盘前执行 L1-L3 分层校验。

### 5.1 L1 — 结构校验（Structure）

纯 JSON/schema 层面，无需解析代码：

- `manifest` 必须是对象
- `id`、`domain`、`action` 如存在，必须是非空字符串
- 若 `id`、`domain`、`action` 同时存在于 manifest，则 `id` 必须等于 `${domain}-${action}`
- `runtime` 必须是 `CommandRuntime` 合法枚举值（`node`、`shell`、`python`、`playwright-cli`）
- `parameters` 如存在必须是**对象数组**，每个元素为 `{ name, description?, required?, default? }`
- 不再支持字符串 shorthand（如 `"title"`）
- 每个参数必须有 `name`，且 `name` 在数组内唯一
- 参数的 `default` 类型必须是 `string | number | boolean` 之一

> **注**：`command create` 会以 CLI 参数为权威，强制覆盖/注入 `id`/`domain`/`action`。因此 `validate` 不带 `[domain] [action]` 时，这三个字段缺失不视为 error，仅发 warning。

### 5.2 L2 — 合规校验（Compliance）

代码静态分析，不执行代码。固定为以下三条：

- **禁止临时 snapshot ref**：代码中不得出现 `e1`、`e15` 等形式的临时引用（正则 `\be\d+\b`）
- **禁止创建或连接浏览器实例**：所有 runtime 的命令代码中均不得出现 `launch`、`connect`、`connectOverCDP`、`newBrowser` 等用于创建或连接浏览器实例的关键词。playwright-cli runtime 的命令代码中 additionally 不得出现 `chrome-remote-interface`。浏览器实例的生命周期必须由用户在 access 层外部手动管理。
- **禁止 inline dynamic import**：代码中不得出现 `await import(...)` 模式

### 5.3 L3 — 契约校验（Contract）

代码结构与 manifest 的一致性：

- **node runtime**：
  - 代码必须是合法 JavaScript 语法
  - 必须是 ESM 模块格式，包含 `export default`
  - `export default` 必须导出一个函数
- **playwright-cli runtime**：
  - 代码必须是合法 JavaScript 语法
  - 必须包含 `/* PARAMS_INJECT */` 占位符（字符串精确匹配）
  - 代码应为函数体形式（非模块）
- **参数一致性（宽松模式）**：
  - 只检查代码中以 `params.xxx` 形式访问的参数
  - 对应的 `xxx` 应在 `manifest.parameters` 中声明
  - 未声明的参数发出 `warning`，不阻断落盘
  - 其他局部变量名不做检查

---

## 6. 校验返回格式

### 6.1 失败格式

`command create` 和 `command validate` 校验失败时，返回结构化错误：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed with 2 error(s)",
    "details": [
      {
        "code": "TEMP_REF_FOUND",
        "message": "Command code contains temporary snapshot references (e.g., e1, e15)",
        "level": "error"
      },
      {
        "code": "MISSING_PARAMS_INJECT",
        "message": "playwright-cli runtime command must contain /* PARAMS_INJECT */",
        "level": "error"
      }
    ]
  }
}
```

`level: "error"` 会阻止落盘；`level: "warning"` 允许落盘但会提示 AI。

### 6.2 成功格式（带 warnings）

`command create` 校验通过但存在 warnings 时，返回 `success: true` 并附带 `warnings` 数组：

```json
{
  "success": true,
  "command": "domain/action",
  "path": "/home/user/.websculpt/commands/domain/action",
  "warnings": [
    {
      "code": "MISSING_README",
      "message": "README.md is missing from the command package",
      "level": "warning"
    }
  ]
}
```

`command validate` 校验通过时：

```json
{
  "success": true,
  "warnings": [
    {
      "code": "UNDECLARED_PARAM",
      "message": "Code accesses params.limit but it is not declared in manifest.parameters",
      "level": "warning"
    }
  ]
}
```

无 warnings 时，`warnings` 字段省略。

---

## 7. 待确定事项

以下事项需在后续讨论或实现中确定。

### 7.1 outputSchema（已移除）

`outputSchema` 字段已于 2026-04-23 从 `CommandManifest` 中移除。原因：

- 没有任何代码消费该字段
- 增加类型表面积和 AI 编写负担
- 未来如有 schema 校验需求，重新添加成本极低

当前 `CommandManifest` 仅保留 `id`、`domain`、`action`、`description`、`parameters`、`runtime`。

### 7.2 校验失败是否允许强制落盘

`command create` 已有 `--force` 用于覆盖已存在的命令。是否需要额外增加 `--skip-validation` 供 AI 调试时绕过校验？还是校验为硬门槛，任何情况下都不通融？

**当前倾向**：校验为硬门槛，不提供 `--skip-validation`。

---

## 8. 命令资产文档规范

### 8.1 README.md

**读者**：命令调用者（消费侧）

**回答的问题**："这个命令怎么用？"

**必须包含**：
- 一句话用途
- 参数表（name、required、default、description）
- 返回值结构说明
- 至少一个 `websculpt <domain> <action>` 调用示例
- 常见业务错误码

**绝不包含**：DOM 选择器、API 端点、反爬策略、失效预测。

### 8.2 context.md

**读者**：命令修复者（维护侧）

**回答的问题**："这个命令为什么这样实现？坏了怎么修？"

**建议章节**：
- `## 沉淀背景`：何时、为何沉淀
- `## 页面结构/数据源特征`：关键 URL、选择器、交互序列
- `## 环境依赖`：登录态、浏览器配置、反爬策略
- `## 失效信号`：页面变化时的表现（如选择器返回 null、抛出 `DRIFT_DETECTED`）
- `## 修复线索`：备用方案、替代入口

**绝不包含**：参数用法说明、通用建议。

### 8.3 职责红线

- README 中绝不出现 CSS 选择器或 DOM 路径
- context 中绝不出现参数用法或调用示例

---

## 9. `command create` 的职责边界

`create` 是命令库的唯一合法入口，不是文件搬运工。

核心职责：
1. **基础校验**（已实现）：保留域保护、entry file 存在性
2. **L1-L3 分层校验**（已实现）：结构校验、合规校验、契约校验，失败阻止落盘
3. **保留域保护**（已实现）：禁止 `command`、`config` 等保留域
4. **身份注入**（已实现）：以 CLI 参数为权威，强制覆盖/注入 manifest 的 `id`/`domain`/`action`
5. **冲突仲裁**（已实现）：同名命令无 `--force` 时拒绝覆盖
6. **环境初始化**（已实现）：自动创建 `~/.websculpt/commands/` 目录树
7. **运行时适配**（已实现）：根据 `runtime` 确定入口文件名（`node` → `command.js`，`shell` → `command.sh`，`python` → `command.py`）
8. **产物完整性检查**（已实现）：README 缺失发 warning；context.md 缺失发 warning
9. **审计记录**（尚未实现）：记录创建/覆盖事件

`.staging/`（或任意 staging 目录）是 AI 的草稿工作区，允许试错；`~/.websculpt/commands/` 是系统的正式档案，只有通过 create 闸机的命令才能进入。

---

## 10. 相关代码路径速查

| 用途 | 路径 |
|------|------|
| CLI 入口 | `src/cli/index.ts` |
| 帮助格式化与路由 | `src/cli/help.ts`（`WebSculptHelp`、`registerHelpCommand`） |
| 动态域命令注册 | `src/cli/domains.ts`（`registerDomainCommands`） |
| 命令创建 | `src/cli/meta/create.ts`（`handleCommandCreate`） |
| 命令预检 | `src/cli/meta/validate.ts`（`handleCommandValidate`） |
| 共享校验逻辑 | `src/cli/meta/command-validation.ts`（`validateCommandPackage`） |
| 命令执行 | `src/cli/engine/command-runner.ts`（`runNodeCommand`、`runPlaywrightCliCommand`） |
| 执行编排 | `src/cli/engine/executor.ts`（`executeCommand`） |
| 命令注册 | `src/cli/engine/registry.ts`（`findCommand`、`listAllCommands`） |
| 公共类型 | `src/types/index.ts`（`CommandManifest`、`CommandRuntime`、`CommandResult`） |
| access / playwright-cli 文档 | `src/access/playwright-cli/guide.md` |
| 现有 builtin 命令示例 | `src/cli/builtin/example/hello/`、`src/cli/builtin/zhihu/author-posts/` |
| compile 设计草案 | `docs/design/CompileDesign.md` |

---

## 11. 下一步建议

1. ~~改造 `command create`~~：已完成（2026-04-23）。`--from-dir` 已替代 `--from-file`，`create` 已提取至 `src/cli/meta/create.ts`。
2. ~~拆分 `command.ts`~~：已完成（2026-04-23）。`list/show/remove` 保留在 `src/cli/meta/command.ts`，`create` 在 `src/cli/meta/create.ts`。
3. ~~实现 L1-L3 校验逻辑~~：已完成（2026-04-23）。`src/cli/meta/command-validation.ts` 已落地。
4. ~~实现 `validate` 独立命令~~：已完成（2026-04-23）。`src/cli/meta/validate.ts` 已落地，CLI 已注册。
5. **编写规范文档**：`src/compile/README.md`（面向 AI，含 runtime 签名、禁止事项、文档规范模板）。
6. **（可选）启用 outputSchema**：如需输出 schema 校验，需重新设计并添加字段。

---

## 12. 沉淀触发机制

沉淀指将探索结果转化为可复用命令资产的过程，是 compile 层与 explore 层衔接的关键环节。

### 12.1 核心分歧：谁来判断是否值得沉淀

| 模式 | 触发方式 | 优点 | 缺点 |
|------|---------|------|------|
| A | AI 探索成功后直接调用 `command create` | 全自动化，闭环最快 | 可能沉淀不成熟的逻辑，命令库质量不可控 |
| B | AI 报告人类，人类决定 | 有质量控制 | 需要人类在场，是瓶颈 |
| C | AI 提案，人类确认/修改/拒绝 | 平衡自动化与质量控制 | 仍有等待时间 |

### 12.2 配置化策略

通过 `config.json` 配置沉淀行为：

```json
{
  "precipitation": {
    "mode": "auto" | "proposal"
  }
}
```

- `auto`：探索成功后 AI 自行判断是否沉淀（模式 A）
- `proposal`：AI 生成提案，由人类确认后执行（模式 C）

### 12.3 模式 A（auto）的 AI 判断标准

AI 自行判断"本次探索是否值得沉淀"，判断理由记录到命令的 `context.md` 或 `manifest.description` 中。判断特征包括：

- 任务是否被重复执行过（而非一次性需求）
- 逻辑是否依赖瞬态环境（如"刚好那天没反爬"）
- 是否经过泛化验证（换参数能正常工作）
- 目标结构稳定性（是否明显会快速失效的 hack）

### 12.4 模式 C（proposal）的交互流程

```
AI 提出沉淀提案 → 人类 agent 确认/修改/拒绝 → 通过后调用 CLI command create
```

**关键决策**：WebSculpt CLI **只负责接收已确认的命令并执行落盘**，不做决策和确认交互。提案和确认由人类用户的 AI agent 在对话层完成，CLI 保持单一职责。

理由：WebSculpt 作为工具层，不应承担"人机交互谈判"的职责；交互体验在 agent 对话界面远比 CLI 自然。

### 12.5 提案格式规范

AI 提案应包含以下字段，供人类 agent 判断：

| 字段 | 说明 |
|------|------|
| `domain` / `action` | 命令名称建议 |
| `reason` | 为什么值得沉淀 |
| `expectedUseCases` | 预期调用场景 |
| `knownRisks` | 可能失效的条件 |

### 12.6 沉淀产物的完整性

沉淀时除 `manifest.json` 和 `command.js` 外，`context.md` 应记录：
- 目标网站的结构特征和前提假设
- 爬取逻辑依赖的环境条件
- 可能的失效信号（页面结构变化时的表现）
