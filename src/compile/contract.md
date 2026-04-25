# 命令资产编写契约

> 本文档定义了 WebSculpt 扩展命令的编写规范，覆盖 manifest 格式、运行时契约、资产文档标准和沉淀工作流。
> 遵循以下契约的命令可被 `command-runner.ts` 正确加载、执行和错误处理，**无需阅读 runner 源码**。

---

## 1. 从 draft 到 create 的完整流程

沉淀命令时，按以下流程执行：

1. **生成骨架**
   ```bash
   websculpt command draft <domain> <action> --runtime <rt>
   ```
   `draft` 生成包含 4 个文件的目录：`manifest.json`（元数据，此时不含身份字段）、入口文件（默认 `command.js`）、`README.md`、`context.md`。具体参数请通过 `websculpt command draft --help` 查看。

2. **填充内容**
   基于探索结果完善命令包：入口文件编写业务逻辑；`manifest.json` 调整参数和描述；`README.md` 和 `context.md` 按第 6 节规范填写。`id`/`domain`/`action` 无需填写。

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
| `runtime` | `string` | 是 | `node` 或 `playwright-cli` |
| `parameters` | `array` | 否 | 参数列表，元素为 `{ name, required?, default?, description? }` |
| `entryFile` | `string` | 否 | 入口文件名，默认 `command.js` |

### 保留域

以下 domain 为系统保留，扩展命令不可使用：

- `command`
- `config`
- `skill`

使用保留域会触发 `RESERVED_DOMAIN` 错误。

---

## 4. playwright-cli 运行时契约

### 4.1 函数签名

代码在 playwright-cli `run-code` 提供的上下文中执行，可直接访问 `page` 对象（Playwright `Page` 实例）。按以下形式编写：

```js
async function (page) {
  /* PARAMS_INJECT */
  // ... your logic
}
```

- **不要**在函数体外写可执行代码。
- 函数体内部可以声明辅助函数。

### 4.2 参数注入

#### 占位符

Runner 会在执行前将文件中的 `/* PARAMS_INJECT */` 替换为一行参数声明：

```js
const params = {"limit":"3","author":"BQW"};
```

因此你的代码中**必须保留**该占位符，并通过 `params.key` 读取参数。

#### 类型与默认值

- **所有参数值都是字符串**。即使 manifest 中声明了 `"default": 3`，注入的也是 `"3"`。
- 如果参数是数字，你需要自行转换：`parseInt(params.limit, 10)` 或 `parseFloat(params.ratio)`。
- **已声明 `default` 的参数**：runner 会自动为缺失参数填充默认值，代码中不要写 fallback（如 `params.limit || 3`），避免 `--limit 0` 被误判为 falsy 而覆盖。
- **未声明 `default` 的参数**：代码自行处理缺失逻辑，不受此限制。

### 4.3 返回值

命令结果通过 `return` 返回。Runner 会从 stdout 中捕获 `### Result\n` 之后的 JSON 并解析后返回给调用方。

```js
return { articles: [{ title: "...", url: "..." }] };
```

- 返回的对象必须是**可序列化的纯数据**。
- **不要**返回函数、循环引用、`undefined` 值或 class 实例。
- 如果需要返回数组，建议包装在对象中：`return { items: [...] }`。

### 4.4 错误处理

#### 基本方式

业务错误请直接抛出 `Error`：

```js
throw new Error("Something went wrong");
```

#### 错误码传递（关键）

`playwright-cli` 的执行环境**不会保留** `Error.code` 属性。Runner 只能通过**错误消息文本中的关键字**来识别业务错误码。

因此，如果你希望 runner 返回特定的错误码（如 `AUTH_REQUIRED`、`NOT_FOUND`、`EMPTY_RESULT`、`MISSING_PARAM`、`DRIFT_DETECTED`），**必须在消息文本中包含该错误码**。

推荐格式：

```js
const error = new Error("[AUTH_REQUIRED] Login required");
error.code = "AUTH_REQUIRED"; // Optional, as inline documentation
throw error;
```

#### 已知错误码

以下错误码会被 runner 识别并原样透传：

| 错误码 | 典型场景 |
|--------|----------|
| `AUTH_REQUIRED` | 需要登录才能访问 |
| `NOT_FOUND` | 目标资源不存在 |
| `EMPTY_RESULT` | 存在但结果为空 |
| `MISSING_PARAM` | 缺少必填参数 |
| `DRIFT_DETECTED` | 页面结构发生变化 |

如果消息中不包含上述关键字，runner 会将错误归类为 `COMMAND_EXECUTION_ERROR`。

### 4.5 环境限制

`playwright-cli` 在**隔离上下文**中执行你的代码：

- **不可用**：`process`、`require`、`fs`、`path`、`console.log`（可能无输出或不可见）等 Node.js 全局变量。
- **可用**：标准 JavaScript 内置对象（`JSON`、`Math`、`Date`、`RegExp` 等）和 Playwright API（通过 `page` 参数）。
- **不要**尝试读写本地文件系统。

**运行前依赖**

- `playwright-cli` 命令需要浏览器环境（CDP 连接）。如果用户未开启远程调试，`command-runner.ts` 会返回 `PLAYWRIGHT_CLI_ATTACH_REQUIRED` 结构化错误。
- 用户完成设置后，再次调用命令即可继续测试，无需重新创建命令。

### 4.6 完整示例

```js
async function (page) {
  /* PARAMS_INJECT */
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // Validate parameters
  if (!author) {
    const error = new Error('[MISSING_PARAM] Parameter "author" is required.');
    error.code = "MISSING_PARAM";
    throw error;
  }

  // Navigate and extract data
  await page.goto(
    "https://example.com/search?q=" + encodeURIComponent(author),
    { waitUntil: "networkidle" }
  );

  const data = await page.evaluate(() => {
    const nodes = document.querySelectorAll(".result-item");
    return Array.from(nodes).map((n) => ({
      title: n.querySelector(".title")?.innerText?.trim(),
      url: n.querySelector("a")?.href,
    }));
  });

  // Business error: empty result
  if (data.length === 0) {
    const error = new Error("[EMPTY_RESULT] No relevant content found");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  // Return success result
  return { items: data.slice(0, limit) };
}
```

---

## 5. Node 运行时契约

### 5.1 模块格式

- 入口文件：`command.js`
- 标准 ESM 模块，导出异步函数（优先 `export default`，亦支持 `export const command = ...`）
- 签名：`async (params: Record<string, string>) => unknown`

### 5.2 参数传递

- 参数由 runner 直接作为函数参数传入，**无需** `/* PARAMS_INJECT */` 占位符
- 所有参数值均为字符串，数字需自行 `parseInt` / `parseFloat`
- runner 已根据 manifest 填充默认值。已声明 `default` 的参数不要在代码中写 fallback（如 `params.limit || 3`），未声明 `default` 的参数自行处理缺失逻辑

### 5.3 返回值

- 直接 `return result`，由 `command-runner.ts` 消费
- 返回的对象必须是可序列化的纯数据

### 5.4 错误处理

- 直接抛出 `Error` 即可
- 业务错误码同样通过消息文本传递（如 `[NOT_FOUND] ...`），runner 会识别并透传

### 5.5 环境

- 完整 Node.js 环境可用（`fs`、`path`、`fetch`、`console` 等）
- 可读写本地文件系统

### 5.6 与 playwright-cli runtime 的核心差异

| 维度 | node | playwright-cli |
|------|------|----------------|
| 模块类型 | ESM 模块 | 函数体片段 |
| 入口签名 | `async (params)` | `async function (page)` |
| 参数方式 | 函数参数传入 | `/* PARAMS_INJECT */` 占位符替换 |
| 运行环境 | 完整 Node.js | 隔离上下文（无 Node.js API） |
| 浏览器 API | 不可用 | 通过 `page` 参数可用 |

---

## 6. 命令资产文档规范

命令包除 `manifest.json` 和入口文件外，还应包含以下两份文档。

### `README.md`

**读者**：命令调用者（消费侧）

**回答的问题**："这个命令怎么用？"

**必须包含**：
- 一句话用途
- 参数表（name、required、default、description）
- 返回值结构说明
- 至少一个 `websculpt <domain> <action>` 调用示例
- 常见业务错误码

**绝不包含**：DOM 选择器、API 端点、反爬策略、失效预测。

### `context.md`

**读者**：命令修复者（维护侧）

**回答的问题**："这个命令为什么这样实现？坏了怎么修？"

**建议章节**：
- `## 沉淀背景`：何时、为何沉淀
- `## 页面结构/数据源特征`：关键 URL、选择器、交互序列
- `## 环境依赖`：登录态、浏览器配置、反爬策略
- `## 失效信号`：页面变化时的表现（如选择器返回 null、抛出 `DRIFT_DETECTED`）
- `## 修复线索`：备用方案、替代入口

**绝不包含**：参数用法说明、通用建议。

### 职责红线

- `README.md` 中绝不出现 CSS 选择器或 DOM 路径
- `context.md` 中绝不出现参数用法或调用示例

---

## 7. 快速检查清单

### L1 结构（manifest 与资产完整性）

- [ ] `manifest.json` 包含非空的 `description` 字段（不能为空字符串或仅含空白字符）
- [ ] `README.md` 包含一句话用途、参数表、返回值说明、调用示例、常见错误码
- [ ] `context.md` 包含沉淀背景、页面结构/数据源特征、环境依赖、失效信号、修复线索

### L2 合规（禁止模式与文档红线）

- [ ] `README.md` 中绝不出现 CSS 选择器或 DOM 路径
- [ ] `context.md` 中绝不出现参数用法或调用示例
- [ ] 代码中没有 `|| default` 形式的参数 fallback
- [ ] **playwright-cli**：没有使用 `process`、`require`、文件读写等 Node.js API

### L3 契约（代码结构与运行时一致性）

所有 runtime：
- [ ] 数值参数通过 `parseInt` / `parseFloat` 转换
- [ ] 错误消息中包含了预期的业务错误码（如 `[NOT_FOUND] ...`）
- [ ] 返回值为可序列化的纯数据对象

**playwright-cli** 专用：
- [ ] 函数签名为 `async function (page)`，且包含 `/* PARAMS_INJECT */`

**Node** 专用：
- [ ] 入口文件导出异步函数（`export default` 或 `export const command`）
- [ ] 签名为 `async (params: Record<string, string>) => unknown`

---

## 8. Runner 侧错误码（供参考）

以下错误码由 runner 自动生成，**不需要**在命令文件中抛出：

| 错误码 | 含义 |
|--------|------|
| `MISSING_PARAMS_INJECT` | 命令文件缺少 `/* PARAMS_INJECT */` 占位符 |
| `MISSING_RESULT_MARKER` | 命令输出缺少 `### Result` 标记 |
| `MALFORMED_RESULT_JSON` | `### Result` 后的内容不是合法 JSON |
| `RUNTIME_NOT_FOUND` | `playwright-cli` 未安装 |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | 浏览器 CDP 会话未 attach |
| `TIMEOUT` | 命令执行超时 |
| `COMMAND_EXECUTION_ERROR` | 未分类的命令执行错误 |
