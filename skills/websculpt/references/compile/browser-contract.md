# browser 运行时契约

> 本文档定义了 `browser` 运行时扩展命令的编写规范。
> 适用于所有运行时的通用约束，请参见 [`./contract.md`](./contract.md)。

---

## 1. 函数签名与模块格式

- 入口文件：`command.js`
- 标准 ESM 模块，必须 `export default` 导出异步函数
- 签名：`async (page, params) => unknown`

`page` 为 Playwright `Page` 实例，`params` 为 runner 传入的参数对象。

- **不要**在函数体外写可执行代码。
- 函数体内部可以声明辅助函数。

---

## 2. 参数传递

- 参数由 runner 作为函数**第二个参数**直接传入
- 所有参数值均为字符串，数字需自行 `parseInt` / `parseFloat`
- runner 已根据 manifest 填充默认值。已声明 `default` 的参数不要在代码中写 fallback（如 `params.limit || 3`），未声明 `default` 的参数自行处理缺失逻辑
- 布尔值需自行判断：`params.someFlag === "true"`

---

## 3. 返回值

- 直接 `return result`，由 daemon 消费后传回 CLI
- 返回的对象必须是可序列化的纯数据
- 不要返回函数、循环引用、`undefined` 值或 class 实例
- 如果需要返回数组，建议包装在对象中：`return { items: [...] }`

---

## 4. 错误处理

直接抛出 `Error` 即可。

业务错误码通过 `error.code` 属性传递，runner 会读取并透传。建议在错误消息中同时包含错误码以便阅读：

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

业务错误码的完整语义列表请参见 [`./contract.md`](./contract.md)。

---

## 5. 环境说明

代码在 daemon 的 Node.js 进程中通过 `import()` 执行，不是隔离 VM。

- **可用**：标准 Node.js 内置模块（`fs`、`path` 等）和 Playwright API（通过 `page` 参数）
- **限制**：L2 校验只允许 import Node.js 内置模块，第三方模块会被拦截
- **`console.log`**：输出到 daemon 的 stdout。daemon 是后台进程，用户通常看不到。调试信息优先通过 `return` 带出
- **不要**在命令中读写本地文件系统——命令应只操作浏览器

如需观察中间状态，可将调试数据一并返回：

```js
return { debug: { url: page.url(), title: await page.title() }, items: [] };
```

### 运行前依赖

- `browser` 命令需要浏览器环境（CDP 连接）。如果用户未开启远程调试，runner 会返回 `BROWSER_ATTACH_REQUIRED` 结构化错误。
- 用户完成设置后，再次调用命令即可继续测试，无需重新创建命令。

---

## 6. 最小可工作模板

沉淀 `browser` 命令时，可直接复用以下结构：

```js
// command.js
export default async (page, params) => {
  const limit = parseInt(params.limit, 10);

  // The injected page is shared across concurrent executions.
  // Always create an isolated page and close it in finally.
  page = await page.context().newPage();
  try {
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
  } finally {
    await page.close();
  }
};
```

```json
// manifest.json
{
  "runtime": "browser",
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
export default async (page, params) => {
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // The injected page is shared across concurrent executions.
  // Always create an isolated page and close it in finally.
  page = await page.context().newPage();
  try {
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
  } finally {
    await page.close();
  }
};
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

### 控制探测节奏

高频 DOM 操作或快速翻页容易触发风控。探索阶段就要测试"什么节奏下站点会拒绝响应"，把这个节奏作为沉淀命令的默认参数。`waitForSelector` 的轮询等待比固定 `sleep` 更反爬友好，但批量调用时仍需注意请求间隔。

### Tab Isolation

`browser` runtime daemon 在所有并发执行之间共享同一个注入的 `page` 对象。直接在共享 `page` 上操作会导致导航竞争、DOM 污染和跨命令数据串扰。

**所有 `browser` 命令必须**在函数开头创建隔离页面，并在 `finally` 中关闭：

```js
export default async (page, params) => {
  page = await page.context().newPage();
  try {
    // ... command logic ...
  } finally {
    await page.close();
  }
};
```

- 通过**重新赋值 `page`**（而非引入 `isolatedPage` 等新变量）来降低后续编辑时误操作原始共享页的风险。
- `finally` 块是强制性的；遗漏 `page.close()` 会导致孤儿标签页在 daemon 中累积，造成内存泄漏并污染 `tab-list`。
- 不要关闭原始的注入 `page`，否则会破坏 daemon 的当前标签页状态。

---

## 9. 运行时专用检查清单

通用检查项见 [`./contract.md`](./contract.md) 第 5 节。

- [ ] 入口文件通过 `export default` 导出异步函数
- [ ] 签名为 `async (page, params) => unknown`
- [ ] 布尔参数通过 `=== "true"` 判断
- [ ] 没有使用非 Node.js 内置模块的 import

---

## 10. 基础设施错误码参考

以下错误码由 runner / daemon 自动生成，**不需要**在命令文件中抛出：

| 错误码 | 含义 |
|--------|------|
| `TIMEOUT` | 命令执行超时（60 秒 socket 超时） |
| `COMMAND_TIMEOUT` | 命令执行超过 20 分钟安全限制 |
| `BROWSER_ATTACH_REQUIRED` | 浏览器 CDP 会话未 attach。确认远程调试已开启；若确认已开启但仍报错，可能是后台进程残留，尝试 `playwright-cli kill-all` 和 `playwright-cli close-all` 后重新 attach |
| `DAEMON_START_FAILED` | daemon 启动失败 |
| `DAEMON_UNREACHABLE` | daemon 已启动但无法连接 |
| `DAEMON_BUSY` | daemon 并发会话数达到上限 |
| `DAEMON_PAGE_LIMIT` | daemon 页面数达到上限 |
| `DAEMON_RESTARTING` | daemon 正在重启 |
| `COMMAND_EXECUTION_ERROR` | 未分类的命令执行错误 |
