# command.js 编写契约（playwright-cli 运行时）

> 本文件定义了 `websculpt` CLI 中 `playwright-cli` 运行时命令的编写规范。
> 遵循以下契约的 `command.js` 可被 `command-runner.ts` 正确加载、执行和错误处理，**无需阅读 runner 源码**。

---

## 1. 函数签名

文件必须导出一个**异步函数**，接收唯一参数 `page`（Playwright `Page` 实例）：

```js
async function (page) {
  /* PARAMS_INJECT */
  // ... 你的逻辑
}
```

- **不要**修改函数签名。
- **不要**在函数体外写可执行代码。
- 函数体内部可以声明辅助函数，但入口必须是这个匿名异步函数。

---

## 2. 参数注入

### 2.1 占位符

Runner 会在执行前将文件中的 `/* PARAMS_INJECT */` 替换为一行参数声明：

```js
const params = {"limit":"3","author":"白强伟"};
```

因此你的代码中**必须保留**该占位符，并通过 `params.key` 读取参数。

### 2.2 类型与默认值

- **所有参数值都是字符串**。即使 manifest 中声明了 `"default": 3`，注入的也是 `"3"`。
- 如果参数是数字，你需要自行转换：`parseInt(params.limit, 10)` 或 `parseFloat(params.ratio)`。
- **不要在代码中写默认值 fallback**（如 `params.limit || 3`）。如果 manifest 中声明了 `default`，runner 会自动为缺失参数填充默认值。这样做还能避免 `--limit 0` 被误判为 falsy 而覆盖的 bug。

---

## 3. 返回值

命令结果通过 `return` 返回。Runner 会从 stdout 中捕获 `### Result\n` 之后的 JSON 并解析后返回给调用方。

```js
return { articles: [{ title: "...", url: "..." }] };
```

- 返回的对象必须是**可序列化的纯数据**。
- **不要**返回函数、循环引用、`undefined` 值或 class 实例。
- 如果需要返回数组，建议包装在对象中：`return { items: [...] }`。

---

## 4. 错误处理

### 4.1 基本方式

业务错误请直接抛出 `Error`：

```js
throw new Error("Something went wrong");
```

### 4.2 错误码传递（关键）

`playwright-cli` 的执行环境**不会保留** `Error.code` 属性。Runner 只能通过**错误消息文本中的关键字**来识别业务错误码。

因此，如果你希望 runner 返回特定的错误码（如 `AUTH_REQUIRED`、`NOT_FOUND`、`EMPTY_RESULT`、`MISSING_PARAM`、`DRIFT_DETECTED`），**必须在消息文本中包含该错误码**。

推荐格式：

```js
const error = new Error("[AUTH_REQUIRED] 需要登录知乎");
error.code = "AUTH_REQUIRED"; // 可选，作为代码内文档
throw error;
```

### 4.3 已知错误码

以下错误码会被 runner 识别并原样透传：

| 错误码 | 典型场景 |
|--------|----------|
| `AUTH_REQUIRED` | 需要登录才能访问 |
| `NOT_FOUND` | 目标资源不存在 |
| `EMPTY_RESULT` | 存在但结果为空 |
| `MISSING_PARAM` | 缺少必填参数 |
| `DRIFT_DETECTED` | 页面结构发生变化 |

如果消息中不包含上述关键字，runner 会将错误归类为 `COMMAND_EXECUTION_ERROR`。

---

## 5. 环境限制

`playwright-cli` 在**隔离上下文**中执行你的代码：

- **不可用**：`process`、`require`、`fs`、`path`、`console.log`（可能无输出或不可见）等 Node.js 全局变量。
- **可用**：标准 JavaScript 内置对象（`JSON`、`Math`、`Date`、`RegExp` 等）和 Playwright API（通过 `page` 参数）。
- **不要**尝试读写本地文件系统。

---

## 6. 完整示例

```js
async function (page) {
  /* PARAMS_INJECT */
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // 参数校验
  if (!author) {
    const error = new Error('[MISSING_PARAM] Parameter "author" is required.');
    error.code = "MISSING_PARAM";
    throw error;
  }

  // 导航与数据抓取
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

  // 业务错误：结果为空
  if (data.length === 0) {
    const error = new Error("[EMPTY_RESULT] 未找到相关内容");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  // 成功返回
  return { items: data.slice(0, limit) };
}
```

---

## 7. 快速检查清单

在提交 `command.js` 前，确认以下事项：

- [ ] 函数签名为 `async function (page)`，且包含 `/* PARAMS_INJECT */`
- [ ] 没有 `|| default` 形式的参数 fallback
- [ ] 数值参数通过 `parseInt` / `parseFloat` 转换
- [ ] 错误消息中包含了预期的业务错误码（如 `[NOT_FOUND] ...`）
- [ ] 返回值为可序列化的纯数据对象
- [ ] 没有使用 `process`、`require`、文件读写等 Node.js API

---

## 8. Runner 侧错误码（供参考）

以下错误码由 runner 自动生成，**不需要**在 `command.js` 中抛出：

| 错误码 | 含义 |
|--------|------|
| `MISSING_PARAMS_INJECT` | 命令文件缺少 `/* PARAMS_INJECT */` 占位符 |
| `MISSING_RESULT_MARKER` | 命令输出缺少 `### Result` 标记 |
| `MALFORMED_RESULT_JSON` | `### Result` 后的内容不是合法 JSON |
| `RUNTIME_NOT_FOUND` | `playwright-cli` 未安装 |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | 浏览器 CDP 会话未 attach |
| `TIMEOUT` | 命令执行超时 |
| `COMMAND_EXECUTION_ERROR` | 未分类的命令执行错误 |
