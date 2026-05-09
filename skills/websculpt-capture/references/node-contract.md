# Node Runtime 契约

> 适用于 `runtime: "node"` 的 WebSculpt command。

## 1. 模块格式

入口文件为 `command.js`，使用标准 ESM。

支持以下三种导出方式之一：

```js
// 方式一：默认导出（推荐）
export default async function (params) {
  return {};
}

// 方式二：命名导出（const）
export const command = async (params) => {
  return {};
};

// 方式三：命名导出（function）
export async function command(params) {
  return {};
}
```

允许签名：

```text
async (params: Record<string, string>) => unknown
```

## 2. 参数

runner 直接传入 `params`，所有值均为字符串。数字使用 `parseInt` 或 `parseFloat`，布尔值使用 `params.flag === "true"`。

manifest 中已声明 `default` 的参数，不要在代码中写 fallback（如 `params.foo || "default"`）。

代码中访问的 `params.xxx` 必须在 `manifest.json` 的 `parameters` 中声明，否则 `capture validate` 会报 `UNDECLARED_PARAM` 错误。

## 3. 环境

Node runtime 可使用以下能力：

- 全局 API：`fetch`、`console`
- Node.js 内置模块（包括 `node:` 前缀）

禁止：

- 引入任何第三方模块
- inline dynamic import（`await import(...)`）

## 4. 代码合规性约束

以下约束会在 `capture validate` 阶段自动检查，不满足将直接报错：

| 规则 | 说明 | 错误码 |
|------|------|--------|
| 代码长度限制 | `command.js` 不得超过 1000 行 | `CODE_TOO_LONG` |
| 禁止临时 snapshot ref | 代码中不得包含类似 `e1`、`e15` 的临时快照引用 | `TEMP_REF_FOUND` |
| 禁止浏览器连接关键词 | 不得使用 `launch`、`connect`、`connectOverCDP`、`newBrowser`、`chrome-remote-interface` | `BROWSER_CONNECTION_FORBIDDEN` |
| 禁止 inline import | 不得使用 `await import(...)` 形式的动态导入 | `INLINE_IMPORT_FORBIDDEN` |
| 禁止非法模块导入 | 只能 import Node.js 内置模块 | `ILLEGAL_IMPORT_FORBIDDEN` |
| 参数声明一致性 | `params.xxx` 必须在 `manifest.parameters` 中声明 | `UNDECLARED_PARAM` |

## 5. 返回值

直接 `return` 可序列化纯数据。返回值会被 `JSON.stringify` 序列化后写入执行日志，因此请确保返回结构可被安全序列化。

推荐：

```js
return { items, count: items.length };
```

避免：

- 返回函数（`JSON.stringify` 会静默丢弃）
- 返回 class 实例（方法等不可枚举属性会丢失）
- 返回循环引用（会导致 `JSON.stringify` 抛出异常，命令执行被标记为失败）
- 返回包含 `undefined` 的结构（对象中的属性会被省略，数组中的元素会变成 `null`）

## 6. 错误

业务错误应设置 `error.code`，并在消息中包含错误码。若未设置，命令失败时会 fallback 到 `COMMAND_EXECUTION_ERROR`。

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

## 7. 检查清单

### 代码质量

- [ ] 使用标准 ESM 导出异步函数（`export default` 或 `export command`）。
- [ ] 签名为 `async (params) => unknown`。
- [ ] 参数转换显式。
- [ ] 没有代码内 default 覆盖 manifest default。
- [ ] 返回值可序列化。
- [ ] 错误码明确。
- [ ] 实现没有超出 evidence。

### 合规约束

- [ ] 代码不超过 1000 行。
- [ ] 无临时 snapshot 引用。
- [ ] 无 inline dynamic import。
- [ ] 只导入 Node.js 内置模块。
- [ ] 所有 `params.xxx` 已在 manifest 中声明。
