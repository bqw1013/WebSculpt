# 命令资产编写契约

> 本文档定义了 WebSculpt 扩展命令的通用编写规范，涵盖 manifest 格式、runtime 选择、资产文档标准以及沉淀工作流。
>
> **如果你已确定运行时，直接阅读对应契约：**
> - `node` → [`./node-contract.md`](./node-contract.md)
> - `playwright-cli` → [`./playwright-cli-contract.md`](./playwright-cli-contract.md)

---

## 1. 如何选择 runtime

### 决策矩阵

| 你的需求 | 推荐 runtime | 关键限制 |
|---------|-------------|---------|
| 需要浏览器 API（DOM 操作、页面导航、截图、复用登录态） | `playwright-cli` | 无 Node.js API（`fs`、`path`、`require` 不可用）；`console.log` 不可见；必须通过 `page` 操作浏览器 |
| 纯 Node.js 逻辑（HTTP 请求、文件读写、数据清洗、调用子进程） | `node` | 无浏览器 API；无法访问已打开的浏览器页面 |
| 同时需要 HTTP 请求和浏览器操作 | 拆分为两个命令（`node` 处理 HTTP + `playwright-cli` 处理浏览器），或由调用方串联 | 一个命令只能声明一种 runtime，不可混合 |

### 反向排除

以下情况会直接导致某个 runtime 不可用：

- **需要读写本地文件** → 不能用 `playwright-cli`（隔离上下文，无 `fs`/`path`）。
- **需要 `console.log` 调试输出** → 优先 `node`；`playwright-cli` 中调试信息只能通过 `return` 带出。
- **需要操作已打开的浏览器标签页（截图、点击、提取 DOM）** → 不能用 `node`；必须用 `playwright-cli`。
- **需要调用 `require` 或 `import` 外部模块** → 不能用 `playwright-cli`。

### 命令不可混合时的处理策略

一个命令只能声明一种 runtime。如果业务逻辑同时需要浏览器和文件系统：

1. **优先拆分**：把浏览器操作沉淀为 `playwright-cli` 命令，把数据处理沉淀为 `node` 命令，由调用方串联。
2. **次选妥协**：若拆分成本过高，在 `playwright-cli` 命令中用 `page.evaluate(() => fetch(...))` 发起请求（受浏览器 CORS 和 Cookie 策略约束），或把文件操作移到命令外部由调用方处理。

### 运行时差异速查

| 维度 | `node` | `playwright-cli` |
|------|--------|------------------|
| 入口文件要求 | 标准 ESM 模块，通过 `export default` 导出异步函数 | 函数体片段；整个文件内容被 `()` 包裹后在 VM 中执行 |
| 入口签名 | `export default async (params) => {...}` | `async function (page) { /* PARAMS_INJECT */ ... }` |
| 参数方式 | Runner 直接作为函数参数传入 | Runner 将 `/* PARAMS_INJECT */` 替换为 `const params = {...}` |
| 运行环境 | 完整 Node.js（`fs`、`fetch`、`console` 可用） | 隔离上下文（无 Node.js API，`console.log` 不可见） |
| 浏览器 API | 不可用 | 通过 `page` 参数可用 |
| 返回值传递 | Runner 消费函数返回值 | Runner 从 stdout 解析 `### Result\n` 后的 JSON |
| 调试方式 | `console.log` 输出到 stderr/stdout | `console.log` 不可见，调试数据通过 `return` 带出 |
| 页面隔离 | 不适用 | 必须创建隔离页面并在 `finally` 中关闭 |
| 错误码传递 | `error.code = "NOT_FOUND"` | 消息文本中包含 `[NOT_FOUND] ...` |

以下仅为快速对比。实现细节必须遵循你已选定的运行时契约文档。

> 沉淀命令必须是 `node` 或 `playwright-cli` runtime。探索中若发现其他语言（如 Python、Shell）路径更优，评估重写为 Node.js 的等价实现；若重写成本过高或不可行，该路径不进入命令库，作为一次性探索成果处理。

**选定 runtime 后，必须阅读对应的运行时契约文档。** `node` 运行时见 [`./node-contract.md`](./node-contract.md)；`playwright-cli` 运行时见 [`./playwright-cli-contract.md`](./playwright-cli-contract.md)。本文档后续章节（manifest 规范、文档标准、错误码）为两种运行时的通用约束，仍需阅读。

---

## 2. 沉淀执行流程

> 对本文档涉及的任何 CLI 命令有疑问，优先执行 `websculpt <command> --help` 获取实时帮助。

用户确认沉淀提案后，按以下流程执行：

### 生成骨架
```bash
websculpt command draft <domain> <action> --runtime <rt>
```
默认输出到 `.websculpt-drafts/<domain>-<action>/`（可用 `--to <path>` 覆盖），生成 `manifest.json`（元数据，此时不含身份字段）、入口文件（默认 `command.js`）、`README.md` 和 `context.md`。具体参数请通过 `websculpt command draft --help` 查看。

### 编写命令
基于探索中已验证的结果，按本文档及对应运行时契约编写业务逻辑并完善文档：入口文件按运行时规范实现业务逻辑；`manifest.json` 调整参数、描述等元数据；`README.md` 和 `context.md` 按第 4 节规范填写。`id`/`domain`/`action` 在 draft 和编写阶段均无需关心，`create` 会强制注入。

### 预检合规
```bash
websculpt command validate --from-dir <path>
```
执行 L1-L3 分层校验（L1 结构：manifest 字段、类型、一致性；L2 合规：禁止代码模式（静态分析）；L3 契约：代码结构与 manifest 的一致性），失败阻止落盘。若未通过，返回**编写命令**修改后重新校验，直到通过。

### 安装落盘
```bash
websculpt command create <domain> <action> --from-dir <path>
```
`create` 以 CLI 参数为权威强制注入 `id`/`domain`/`action`。L1-L3 校验失败一律阻止落盘，即使使用 `--force` 也不例外。

### 测试验证
安装落盘后必须执行命令验证：先执行**正确性测试**（使用探索时已验证的参数执行，确认输出与预期一致），再执行**泛化性测试**（换用不同的参数组合执行，确认命令不依赖硬编码的特定值）。若任一测试未通过，返回**编写命令**修复后重新执行 validate → create → 测试。

---

## 3. Manifest 规范

`manifest.json` 是命令的元数据声明，由 `command draft` 生成骨架，`command create` 强制注入身份字段。

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 系统注入 | 格式为 `{domain}-{action}`，draft 阶段可缺失，create 时强制注入 |
| `domain` | `string` | 系统注入 | 命令所属领域，create 时以 CLI 参数强制覆盖 |
| `action` | `string` | 系统注入 | 命令操作名，create 时以 CLI 参数强制覆盖 |
| `description` | `string` | 是 | 命令用途，**不能为空字符串或仅含空白字符** |
| `runtime` | `string` | 是 | `node` 或 `playwright-cli`。`shell`、`python` 为 CLI 预留类型，但沉淀到命令库时必须重写为 `node` 或 `playwright-cli` 的等价实现 |
| `parameters` | `array` | 否 | 参数列表，元素为 `{ name, required?, default?, description? }` |
| `prerequisites` | `string[]` | 否 | 命令特定的前置条件说明（如 `"Requires user login"`） |
| `entryFile` | `string` | 否 | 入口文件名，默认 `command.js` |

### 保留域

以下 domain 为系统保留，扩展命令不可使用：

- `command`
- `config`
- `skill`

使用保留域会触发 `RESERVED_DOMAIN` 错误。

---

## 4. 命令资产文档规范

命令包除 `manifest.json` 和入口文件外，还应包含以下两份文档。

### `README.md`

**读者**：命令调用者（消费侧）

**回答的问题**："这个命令怎么用？"

**必须包含以下章节**：
- `## Description`：一句话用途
- `## Parameters`：参数表（name、required、default、description）
- `## Return Value`：返回值结构说明
- `## Usage`：至少一个 `websculpt <domain> <action>` 调用示例
- `## Common Error Codes`：常见业务错误码

**绝不包含**：DOM 选择器、API 端点、反爬策略、失效预测。

### `context.md`

**读者**：命令修复者（维护侧）

**回答的问题**："这个命令为什么这样实现？坏了怎么修？"

**必须包含以下章节**：
- `## Precipitation Background`：何时、为何沉淀
- `## Page Structure`：关键 URL、选择器、交互序列
- `## Environment Dependencies`：登录态、浏览器配置、反爬策略
- `## Failure Signals`：页面变化时的表现（如选择器返回 null、抛出 `DRIFT_DETECTED`）
- `## Repair Clues`：备用方案、替代入口

**绝不包含**：参数用法说明、通用建议。

### 探索阶段素材收集

编写 `context.md` 所需的素材应在探索过程中积累，而非沉淀时凭空编造。探索完成后回顾并整理以下信息：

| 素材项 | 说明 |
|--------|------|
| 工具序列 | 完成该子任务使用的工具链 |
| 关键 URL / API | 实际访问的端点或页面地址 |
| 数据提取方式 | 选择器、正则、API 响应路径等 |
| 反爬措施及规避 | 等待策略、请求节奏、会话复用方式 |
| 验证通过的参数 | 在探索中确认有效的参数组合 |

### 职责红线

- `README.md` 中绝不出现 CSS 选择器或 DOM 路径
- `context.md` 中绝不出现参数用法或调用示例

---

## 5. 业务错误码参考

以下业务错误码对**两种运行时**均适用。传递机制不同（详见各运行时专用文档），但语义一致。

| 错误码 | 典型场景 |
|--------|----------|
| `AUTH_REQUIRED` | 需要登录才能访问 |
| `NOT_FOUND` | 目标资源不存在 |
| `EMPTY_RESULT` | 存在但结果为空 |
| `MISSING_PARAM` | 缺少必填参数 |
| `DRIFT_DETECTED` | 页面结构发生变化 |

若 runner 无法匹配已知业务错误码，则归类为 `COMMAND_EXECUTION_ERROR`。

---

## 6. 快速检查清单

### L1 结构（manifest 与资产完整性）

- [ ] `manifest.json` 包含非空的 `description` 字段（不能为空字符串或仅含空白字符）
- [ ] `README.md` 包含 `## Description`、`## Parameters`、`## Return Value`、`## Usage`、`## Common Error Codes` 章节
- [ ] `context.md` 包含 `## Precipitation Background`、`## Page Structure`、`## Environment Dependencies`、`## Failure Signals`、`## Repair Clues` 章节

### L2 合规（禁止模式与文档红线）

- [ ] `README.md` 中绝不出现 CSS 选择器或 DOM 路径
- [ ] `context.md` 中绝不出现参数用法或调用示例
- [ ] 代码中没有 `|| default` 形式的参数 fallback

### L3 契约（代码结构与运行时一致性）

所有 runtime：
- [ ] 数值参数通过 `parseInt` / `parseFloat` 转换
- [ ] 错误消息中包含了预期的业务错误码（如 `[NOT_FOUND] ...`）
- [ ] 返回值为可序列化的纯数据对象

`playwright-cli` 专用：见 [`./playwright-cli-contract.md`](./playwright-cli-contract.md)
- [ ] 函数签名为 `async function (page)`，且包含 `/* PARAMS_INJECT */`

`node` 专用：见 [`./node-contract.md`](./node-contract.md)
- [ ] 入口文件通过 `export default` 导出异步函数
- [ ] 签名为 `async (params: Record<string, string>) => unknown`

---

## 7. 通用 Runner 错误码参考

以下错误码由 runner 自动生成，**不需要**在命令文件中抛出：

| 错误码 | 含义 | 适用 runtime |
|--------|------|-------------|
| `TIMEOUT` | 命令执行超时 | 所有 |
| `COMMAND_EXECUTION_ERROR` | 未分类的命令执行错误 | 所有 |

运行时专用的 runner 错误码，见对应运行时契约文档。
