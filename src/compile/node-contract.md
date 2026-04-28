# Node 运行时契约

> 本文档定义了 Node.js 运行时扩展命令的编写规范。
> 适用于所有运行时的通用约束，请参见 [`./contract.md`](./contract.md)。

---

## 1. 模块格式

- 入口文件：`command.js`
- 标准 ESM 模块，必须导出默认的异步函数
- 签名：`export default async (params: Record<string, string>) => unknown`

---

## 2. 参数传递

- 参数由 runner 直接作为函数参数传入，**无需** `/* PARAMS_INJECT */` 占位符
- 所有参数值均为字符串，数字需自行 `parseInt` / `parseFloat`
- runner 已根据 manifest 填充默认值。已声明 `default` 的参数不要在代码中写 fallback（如 `params.limit || 3`），未声明 `default` 的参数自行处理缺失逻辑

---

## 3. 返回值

- 直接 `return result`，由 `command-runner.ts` 消费
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

## 5. 环境

- 完整 Node.js 环境可用（`fs`、`path`、`fetch`、`console` 等）
- 可读写本地文件系统

---

## 6. 完整示例

```js
export default async function (params) {
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // Validate parameters
  if (!author) {
    const error = new Error('[MISSING_PARAM] Parameter "author" is required.');
    error.code = "MISSING_PARAM";
    throw error;
  }

  // Fetch data
  const response = await fetch(
    "https://api.example.com/search?q=" + encodeURIComponent(author)
  );

  if (response.status === 404) {
    const error = new Error("[NOT_FOUND] No user found");
    error.code = "NOT_FOUND";
    throw error;
  }

  const data = await response.json();

  // Business error: empty result
  if (!data.items || data.items.length === 0) {
    const error = new Error("[EMPTY_RESULT] No relevant content found");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  // Return success result
  return { items: data.items.slice(0, limit) };
}
```

---

## 7. 检查清单（Node 专用）

- [ ] 入口文件通过 `export default` 导出异步函数
- [ ] 签名为 `async (params: Record<string, string>) => unknown`
- [ ] 代码中不存在 `/* PARAMS_INJECT */` 占位符
- [ ] 没有 `|| default` 形式的参数 fallback
- [ ] 数值参数通过 `parseInt` / `parseFloat` 转换
- [ ] 错误消息中包含了预期的业务错误码
- [ ] 返回值为可序列化的纯数据对象
