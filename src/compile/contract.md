# 命令资产编写契约

> 本文档定义了 WebSculpt 扩展命令的通用编写规范，涵盖 manifest 格式、runtime 选择、资产文档标准以及沉淀工作流。
>
> **如果你已确定运行时，直接阅读对应契约：**
> - `node` → [`./node-contract.md`](./node-contract.md)
> - `playwright-cli` → [`./playwright-cli-contract.md`](./playwright-cli-contract.md)

---

## 1. 从 draft 到 create 的完整流程

沉淀命令时，按以下流程执行：

1. **生成骨架**
   ```bash
   websculpt command draft <domain> <action> --runtime <rt>
   ```
   `draft` 生成包含 4 个文件的目录：`manifest.json`（元数据，此时不含身份字段）、入口文件（默认 `command.js`）、`README.md` 和 `context.md`。具体参数请通过 `websculpt command draft --help` 查看。

2. **填充内容**
   基于探索结果完善命令包：入口文件编写业务逻辑；`manifest.json` 调整参数和描述；`README.md` 和 `context.md` 按第 5 节规范填写。`id`/`domain`/`action` 无需填写。

3. **预检合规**
   ```bash
   websculpt command validate --from-dir <path>
   ```
   执行 L1-L3 分层校验，失败阻止落盘：
   - **L1 结构**：manifest 字段、类型、一致性
   - **L2 合规**：禁止代码模式（静态分析）
   - **L3 契约**：代码结构与 manifest 的一致性

4. **安装落盘**
   ```bash
   websculpt command create <domain> <action> --from-dir <path>
   ```
   `create` 以 CLI 参数为权威强制注入 `id`/`domain`/`action`。L1-L3 校验失败一律阻止落盘，即使使用 `--force` 也不例外。

> 身份字段（`id`/`domain`/`action`）在 draft 和填充阶段均无需关心，`create` 会强制覆盖。

---

## 2. 如何选择 runtime

| 场景 | 推荐 runtime | 说明 |
|------|-------------|------|
| 需要浏览器 API（DOM 操作、页面导航、截图） | `playwright-cli` | 在隔离上下文中执行，无 Node.js API |
| 纯 Node.js 逻辑（HTTP 请求、文件处理、数据清洗） | `node` | 完整 Node.js 环境，可使用 `fs`、`fetch` 等 |

一个命令只能声明一种 runtime，不可混合使用。

> 沉淀命令必须是 `node` 或 `playwright-cli` runtime。探索中若发现其他语言（如 Python、Shell）路径更优，评估重写为 Node.js 的等价实现；若重写成本过高或不可行，该路径不进入命令库，作为一次性探索成果处理。

**选定 runtime 后，必须阅读对应的运行时契约文档。** `node` 运行时见 [`./node-contract.md`](./node-contract.md)；`playwright-cli` 运行时见 [`./playwright-cli-contract.md`](./playwright-cli-contract.md)。本文档后续章节（manifest 规范、文档标准、错误码）为两种运行时的通用约束，仍需阅读。

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

## 4. 运行时差异速查

| 维度 | `node` | `playwright-cli` |
|------|--------|------------------|
| 模块类型 | ESM 模块 | 函数体片段 |
| 入口签名 | `async (params)` | `async function (page)` |
| 参数方式 | 函数参数传入 | `/* PARAMS_INJECT */` 占位符替换 |
| 运行环境 | 完整 Node.js | 隔离上下文（无 Node.js API） |
| 浏览器 API | 不可用 | 通过 `page` 参数可用 |
| 错误码传递 | `error.code` 属性 | 消息文本中的关键字 |

以下仅为快速对比。实现细节必须遵循你已选定的运行时契约文档。

---

## 5. 命令资产文档规范

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

### 职责红线

- `README.md` 中绝不出现 CSS 选择器或 DOM 路径
- `context.md` 中绝不出现参数用法或调用示例

---

## 6. 业务错误码参考

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

## 7. 快速检查清单

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

## 8. 通用 Runner 错误码参考

以下错误码由 runner 自动生成，**不需要**在命令文件中抛出：

| 错误码 | 含义 | 适用 runtime |
|--------|------|-------------|
| `TIMEOUT` | 命令执行超时 | 所有 |
| `COMMAND_EXECUTION_ERROR` | 未分类的命令执行错误 | 所有 |

运行时专用的 runner 错误码，见对应运行时契约文档。
