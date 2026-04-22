# WebSculpt Compile 层设计草案

> 本文档记录 compile 层的设计目标与规划，供后续实现参考。
> 当前 `src/compile/` 目录及 `validator.ts` 尚未创建，以下内容为设计方向而非已实现状态。

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
│         │      │ 工具选择倾向   │      │ 共享校验逻辑   │
└─────────┘      └──────────────┘      └──────────────┘
```

- **access**：通过文档约束确保基础设施就绪（Playwright CLI 等），提供各工具的操作参考文档。
- **explore**：策略文档层。一个（或多个）Markdown 文件，告诉 AI 面对不同场景时应该优先用什么工具、遵循什么策略。具体工具如何使用，AI 阅读 access 层各子目录的 README。
- **compile**：命令工厂规范层。告诉 AI "探索完成后，如何把结果写成 WebSculpt 认可的命令"。

**关键设计决策**：compile **不暴露独立 CLI 命令**。它是一个由 "规范文档 + 共享校验器" 组成的模块，校验逻辑集成到 `command create` 中。

---

## 3. 当前代码库现状

### 3.1 已落地的基础设施

| 模块 | 路径 | 状态 |
|------|------|------|
| CLI 入口与路由 | `src/cli/index.ts` | 已落地 |
| 命令注册与查找 | `src/cli/engine/registry.ts` | 已落地 |
| 命令执行器 | `src/cli/engine/command-runner.ts` | 已落地（支持 `node`、`playwright-cli`） |
| 命令创建 | `src/cli/meta/command.ts` | 已落地（`handleCommandCreate`，接收 `CommandPackage`） |
| 公共类型 | `src/types/index.ts` | 已落地（`CommandManifest`、`CommandRuntime`、`CommandResult` 等） |
| access / playwright-cli | `src/access/playwright-cli/guide.md` | 仅文档约束 |
| compile / validator | `src/compile/validator.ts` | **尚未实现** |
| compile / 规范文档 | `src/compile/README.md` | **尚未创建** |

### 3.2 命令资产格式

一个命令由两部分组成（`CommandPackage`）：

```typescript
interface CommandPackage {
  manifest: CommandManifest;
  code: string;
  readme?: string;
  context?: string | Record<string, unknown>;
}
```

用户目录结构：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js          # 默认入口，runtime 决定实际文件名
  ├── README.md           # 可选
  └── context.md          # 可选
```

### 3.3 Runtime 执行契约

**`node` runtime**：

- 入口文件：`command.js`
- 标准 ESM 模块，导出异步函数（优先 `export default`，亦支持 `export const command = ...`）
- 签名：`async (params: Record<string, string>) => unknown`
- 直接 `return result`，由 `command-runner.ts` 的 `runNodeCommand` 消费

**`playwright-cli` runtime**：

- 入口文件：`command.js`
- **不是 ESM 模块**，而是一个函数体片段（被 `playwright-cli run-code` 包裹执行）
- 签名：`async function (page) { ... }`
- **必须包含** `/* PARAMS_INJECT */` 占位符，由 `command-runner.ts` 在运行时替换为 `const params = {...};`
- 通过 `return result` 输出结果，`playwright-cli` 将其提取为 stdout 中的 `### Result\n<json>`
- **命令内部禁止包含 CDP attach 逻辑**，连接由 access 层外部管理

> **注意**：两种 runtime 的代码结构完全不同（模块 vs 函数体），AI 编写时必须区分。

---

## 4. 已确定的设计决策

### 4.1 Compile 层不暴露 CLI

- 不设 `websculpt compile` 命令。
- `src/compile/` 目录仅包含：**规范文档** + **共享校验逻辑** + **运行时契约定义**。
- `command create` 内部调用 `compile/validator.ts` 完成落盘前校验。

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

---

## 5. 校验分层设计（L1-L3）

规划中 `compile/validator.ts` 将校验分为三层，在 `command create` 落盘前执行。

### 5.1 L1 — 结构校验（Structure）

纯 JSON/schema 层面，无需解析代码：

- `manifest` 必须是对象
- `id`、`domain`、`action` 必须是非空字符串
- `id` 格式应为 `${domain}-${action}`（或至少与 domain/action 一致）
- `runtime` 必须是 `CommandRuntime` 合法枚举值（`node`、`shell`、`python`、`playwright-cli`）
- `parameters` 如存在必须是数组
- 每个参数必须有 `name`，且 `name` 在数组内唯一
- 参数的 `default` 类型必须是 `string | number | boolean` 之一

### 5.2 L2 — 合规校验（Compliance）

代码静态分析，不执行代码：

- **禁止临时 snapshot ref**：代码中不得出现 `e1`、`e15` 等形式的临时引用（正则 `e\d+\b`）
- **禁止创建或连接浏览器实例**：所有 runtime 的命令代码中均不得出现 `launch`、`connect`、`connectOverCDP`、`newBrowser` 等用于创建或连接浏览器实例的关键词。playwright-cli runtime 的命令代码中 additionally 不得出现 `chrome-remote-interface`。浏览器实例的生命周期必须由用户在 access 层外部手动管理。
- **禁止 inline dynamic import**：代码中不得出现 `await import(...)` 模式
- （待讨论）是否禁止 `eval()` 调用

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
- **参数一致性**（待确定严格度）：
  - 代码中引用的 `params.xxx` 对应的 `xxx` 应在 `manifest.parameters` 中声明
  - 或至少对未声明的参数发出 warning

---

## 6. 校验失败的返回格式

`command create` 校验失败时，应返回结构化错误，便于 AI 精确修复：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Command package failed validation",
    "details": [
      {
        "code": "TEMP_REF_FOUND",
        "message": "Line 7: temporary snapshot ref 'e15' detected",
        "level": "error"
      },
      {
        "code": "MISSING_PARAMS_INJECT",
        "message": "playwright-cli runtime requires /* PARAMS_INJECT */ placeholder",
        "level": "error"
      },
      {
        "code": "UNDECLARED_PARAM",
        "message": "Code uses 'limit' but manifest does not declare it",
        "level": "warning"
      }
    ]
  }
}
```

`level: "error"` 会阻止落盘；`level: "warning"` 允许落盘但会提示 AI。

---

## 7. 待确定事项

以下事项需在后续讨论或实现中确定。

### 7.1 L3 参数一致性检查的范围

- **选项 A（严格）**：代码中引用的每个变量都必须在 `manifest.parameters` 中声明（可能误伤常量和其他局部变量）
- **选项 B（宽松）**：只检查 `params.xxx` 形式的访问，其他变量名不检查
- **选项 C（跳过）**：不做参数一致性检查，完全信任 AI

### 7.2 CDP 未连接的错误检测策略（已确定）

已采用**后判**策略：`command-runner.ts` 在执行 `run-code` 失败后，根据 stderr/stdout 中的关键词（`attach`、`connect`、`browser`、`Session` 等）启发式判断，返回 `PLAYWRIGHT_CLI_ATTACH_REQUIRED` 结构化错误。

> 当前 `src/access/playwright-cli/` 仍为纯文档约束，无代码实现。状态检测逻辑位于 `command-runner.ts` 中。

### 7.3 校验失败是否允许强制落盘

`command create` 已有 `--force` 用于覆盖已存在的命令。是否需要额外增加 `--skip-validation` 供 AI 调试时绕过校验？还是校验为硬门槛，任何情况下都不通融？

### 7.4 L2 合规检查项的扩充

除已确定的 "临时 ref、CDP 连接逻辑、inline import" 三条外，是否增加：

- `eval()` 调用检查？（有安全风险，但某些场景下合法）
- `fetch` 到非目标域名检查？（可能过度约束 AI）
- 其他团队代码规范中的强制规则（如 `any` 类型检查——但当前命令代码是 JS 而非 TS，不适用）

### 7.5 L4 — outputSchema 是否启用

`CommandManifest` 中已定义 `outputSchema?: Record<string, unknown>`，但目前没有任何代码消费该字段。

- 是否要求 AI 在编写命令时同时声明输出 schema？
- 如果启用，L4 测试阶段可以校验实际输出是否符合声明的 schema。
- 如果暂不启用，保留字段但不强制。

### 7.6 `src/compile/README.md` 的具体内容

规范文档面向 AI，需包含以下章节（具体内容待撰写）：

1. 命令资产结构（manifest + code + 可选文件）
2. 各 runtime 的代码签名契约（node vs playwright-cli）
3. 强制规则清单（校验会检查的项目）
4. 编写建议（优先 API、稳定选择器、异常处理、注释语言等）
5. AI 自测流程（调用命令验证、参数泛化性测试、CDP 环境说明）

### 7.7 `command create` 的输入方式

当前 `command create` 仅支持 `--from-file <path>`，要求 AI 先将草稿写成 JSON 文件。是否需要支持其他输入方式（如 stdin、或直接通过 API 传入对象）？

---

## 8. 相关代码路径速查

| 用途 | 路径 |
|------|------|
| CLI 入口 | `src/cli/index.ts` |
| 命令创建 | `src/cli/meta/command.ts`（`handleCommandCreate`、`validateManifest`） |
| 命令执行 | `src/cli/engine/command-runner.ts`（`runNodeCommand`、`runPlaywrightCliCommand`） |
| 命令注册 | `src/cli/engine/registry.ts`（`findCommand`、`listAllCommands`） |
| 公共类型 | `src/types/index.ts`（`CommandManifest`、`CommandRuntime`、`CommandResult`） |
| access / playwright-cli 文档 | `src/access/playwright-cli/guide.md` |
| 现有 builtin 命令示例 | `src/cli/builtin/example/hello/`、`src/cli/builtin/zhihu/articles/` |
| compile 设计草案 | `docs/design/CompileDesign.md` |

---

## 9. 下一步建议（供后续会话参考）

1. **评估 compile 层形态**：确定 validator 是独立模块还是直接集成到 `command create` 中。
2. **确定校验规则清单**：把 7.1、7.3、7.4 的选项确定下来。
3. **实现校验逻辑**：基于确定的规则，实现 `validateCommandPackage()`（位置视 compile 层评估结果而定）。
4. **编写规范文档**：面向 AI 的命令编写规范文档，明确各 runtime 的签名和禁止事项。
5. **（可选）L4 outputSchema**：视决策是否启用输出 schema 校验。
