# playwright-cli 运行时契约

> 本文档定义了 `playwright-cli` 运行时扩展命令的编写规范。
> 适用于所有运行时的通用约束，请参见 [`./contract.md`](./contract.md)。

---

## 1. 函数签名

代码在 `playwright-cli run-code` 提供的上下文中执行，可直接访问 `page` 对象（Playwright `Page` 实例）。按以下形式编写：

```js
async function (page) {
  /* PARAMS_INJECT */
  // ... 你的逻辑
}
```

- **不要**在函数体外写可执行代码。
- 函数体内部可以声明辅助函数。

---

## 2. 参数注入

### 占位符

Runner 会在执行前将文件中的 `/* PARAMS_INJECT */` 替换为一行参数声明：

```js
const params = {"limit":"3","author":"BQW"};
```

因此你的代码中**必须保留**该占位符，并通过 `params.key` 读取参数。

### 为什么占位符必须在函数体内

`playwright-cli` 的 daemon 执行 `run-code` 时，核心逻辑大致如下：

```js
const fn = vm.runInContext("(" + code + ")", context);
const result = await fn(page);
```

整个 `code` 字符串会被一对圆括号 `()` 包裹。合法的包裹结果必须是一个**表达式**。

**错误写法**（占位符在函数体外）：

```js
/* PARAMS_INJECT */
async function (page) {
  // logic
}
```

Runner 替换后变成：

```js
const params = {"limit":"10"};
async function (page) {
  // logic
}
```

被 daemon 包裹后：

```js
(const params = {"limit":"10"}; async function (page) { ... })
```

这在 JS 语法中是非法的——`const` 声明不能出现在表达式上下文中，会报 `SyntaxError: Unexpected token 'const'`。

**正确写法**：

```js
async function (page) {
  /* PARAMS_INJECT */
  // logic
}
```

Runner 替换后：

```js
async function (page) {
  const params = {"limit":"10"};
  // logic
}
```

被 daemon 包裹后：

```js
(async function (page) { const params = {"limit":"10"}; ... })
```

这是一个合法的**函数表达式**。

### 另一种可行的写法

箭头函数同样合法：

```js
async (page) => {
  /* PARAMS_INJECT */
  // logic
}
```

两种写法验证均通过，但函数声明式更符合本文档的示例风格。

### 类型与默认值

- **所有参数值都是字符串**。即使 manifest 中声明了 `"default": 3`，注入的也是 `"3"`。
- 如果参数是数字，你需要自行转换：`parseInt(params.limit, 10)` 或 `parseFloat(params.ratio)`。
- 如果参数是布尔值，需要自行判断：`params.someFlag === "true"`。
- **已声明 `default` 的参数**：runner 会自动为缺失参数填充默认值，代码中不要写 fallback（如 `params.limit || 3`），避免 `--limit 0` 被误判为 falsy 而覆盖。
- **未声明 `default` 的参数**：代码自行处理缺失逻辑，不受此限制。

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

### 基本方式

业务错误请直接抛出 `Error`：

```js
throw new Error("Something went wrong");
```

### 错误码传递（关键）

`playwright-cli` 的执行环境**不会保留** `Error.code` 属性。Runner 只能通过**错误消息文本中的关键字**来识别业务错误码。

因此，如果你希望 runner 返回特定的业务错误码，**必须在消息文本中包含该错误码**。

推荐格式：

```js
throw new Error("[AUTH_REQUIRED] 需要登录");
```

> `playwright-cli` 的执行环境不会保留 `Error.code` 属性，即使你在代码中设置了 `error.code`，runner 也无法读取。请确保错误码出现在消息文本中即可。

如果消息中不包含已知业务错误码关键字，runner 会将错误归类为 `COMMAND_EXECUTION_ERROR`。业务错误码的完整语义定义见 [`./contract.md`](./contract.md) 第 6 节。

---

## 5. 环境限制

`playwright-cli` 在**隔离上下文**中执行你的代码：

- **不可用**：`process`、`require`、`fs`、`path`、`console.log`（可能无输出或不可见）等 Node.js 全局变量。
- **可用**：标准 JavaScript 内置对象（`JSON`、`Math`、`Date`、`RegExp` 等）和 Playwright API（通过 `page` 参数）。
- **不要**尝试读写本地文件系统。

`run-code` 在隔离 VM 中执行，`console.log` 不会出现在 stdout 中。调试信息的唯一出口是 `return`。如需观察中间状态，可将调试数据一并返回：

```js
return { debug: { url: page.url(), title: await page.title() }, items: [] };
```

### 运行前依赖

- `playwright-cli` 命令需要浏览器环境（CDP 连接）。如果用户未开启远程调试，`command-runner.ts` 会返回 `PLAYWRIGHT_CLI_ATTACH_REQUIRED` 结构化错误。
- 用户完成设置后，再次调用命令即可继续测试，无需重新创建命令。

### PowerShell 手动测试陷阱

如果你在 PowerShell 中直接手动调用 `playwright-cli run-code "<code>"` 测试命令，代码字符串中的空格、花括号、分号可能被 PowerShell 拆分为多个 token，导致 `SyntaxError` 或 `too many arguments`。这是 **shell 传参问题，不是命令本身的问题**。

websculpt runner 使用 `execFile` 数组传参，不受 shell 拆分影响。因此：

- 手动测试时，优先用 `eval` 验证选择器是否 work
- 完整的 runner 链路测试交给 websculpt 自身
- 不要因为在 PowerShell 手动测试失败而修改命令代码

---

## 6. 最小可工作模板

沉淀 `playwright-cli` 命令时，可直接复用以下结构：

```js
// command.js
async function (page) {
  /* PARAMS_INJECT */
  const limit = parseInt(params.limit, 10);

  await page.goto("https://example.com", { waitUntil: "networkidle" });
  await page.waitForSelector(".item", { timeout: 15000 });

  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".item")).map((el) => ({
      title: el.querySelector("h2")?.textContent?.trim() || "",
    }));
  });

  if (items.length === 0) {
    throw new Error("[EMPTY_RESULT] No items found");
  }

  return { items: items.slice(0, limit) };
}
```

```json
// manifest.json
{
  "runtime": "playwright-cli",
  "description": "Fetch items from example.com",
  "parameters": [
    {
      "name": "limit",
      "required": false,
      "default": "10",
      "description": "Max items to return"
    }
  ]
}
```

---

## 7. 完整示例

```js
async function (page) {
  /* PARAMS_INJECT */
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // Validate parameters
  if (!author) {
    throw new Error('[MISSING_PARAM] Parameter "author" is required.');
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
    throw new Error("[EMPTY_RESULT] No relevant content found");
  }

  // Return success result
  return { items: data.slice(0, limit) };
}
```

---

## 8. 最佳实践

### `waitForSelector` 不能省

`page.goto` 的 `networkidle` 只能保证网络请求趋于平静，不能保证前端框架（React/Vue 等）已完成 hydrate 并插入 DOM。提取数据前务必显式等待目标元素：

```js
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("article.Box-row", { timeout: 15000 });
// 再提取数据
```

`waitForSelector` 会轮询 DOM，直到元素出现或超时，比固定 `sleep` 更反爬友好。

### URL 构建

手动拼接 URL 时，参数值应使用 `encodeURIComponent` 编码。即使常见语言名没有特殊字符，C++ 的 `++` 等字符也必须编码，否则 URL 解析会出错。

### 选择器稳定性

优先使用框架级组件类（如 GitHub Primer 的 `Box-row`）或语义属性（`data-testid`、aria-label），避免使用动态生成的类名。记录备选定位策略到 `context.md`，便于失效后修复。

---

## 9. 运行时专用检查清单

通用检查项见 [`./contract.md`](./contract.md) 第 7 节。

- [ ] 函数签名为 `async function (page)`，且包含 `/* PARAMS_INJECT */`
- [ ] `/* PARAMS_INJECT */` 位于函数体内部，不在函数体外
- [ ] 布尔参数通过 `=== "true"` 判断
- [ ] 没有使用 `process`、`require`、文件读写等 Node.js API

---

## 10. Runner 错误码参考

以下错误码由 runner 自动生成，**不需要**在 `command.js` 中抛出：

| 错误码 | 含义 |
|--------|------|
| `MISSING_PARAMS_INJECT` | 命令文件缺少 `/* PARAMS_INJECT */` 占位符 |
| `MISSING_RESULT_MARKER` | 命令输出缺少 `### Result` 标记 |
| `MALFORMED_RESULT_JSON` | `### Result` 后的内容不是合法 JSON |
| `RUNTIME_NOT_FOUND` | `playwright-cli` 未安装 |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | 浏览器 CDP 会话未 attach。确认远程调试已开启；若确认已开启但仍报错，可能是后台进程残留，尝试 `playwright-cli kill-all` 和 `playwright-cli close-all` 后重新 attach |
