# Node Runtime 契约

> 适用于 `runtime: "node"` 的 WebSculpt command。

## 1. 模块格式

入口文件为 `command.js`，使用标准 ESM。

推荐导出：

```js
export default async function (params) {
  return {};
}
```

允许的签名：

```text
async (params: Record<string, string>) => unknown
```

## 2. 参数

- runner 直接传入 `params`。
- 所有参数值都是字符串。
- 数字使用 `parseInt` 或 `parseFloat`。
- 布尔值使用 `params.flag === "true"`。
- manifest 中已声明 default 的参数，不要在代码中写 `params.foo || "default"`。

## 3. 环境

Node runtime 可使用：

- `fetch`
- Node.js 内置模块
- `console`

不要引入 evidence 没有要求的第三方依赖。若确实需要依赖，应先确认项目依赖和类型定义。

## 4. 返回值

直接 `return` 可序列化纯数据。

推荐：

```js
return { items, count: items.length };
```

避免：

- 返回函数
- 返回 class 实例
- 返回循环引用
- 返回包含 `undefined` 的结构

## 5. 错误

业务错误应设置 `error.code`，并在消息中包含错误码：

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

常用错误码见 `contract.md`。

## 6. 检查清单

- [ ] 使用标准 ESM 导出异步函数。
- [ ] 签名为 `async (params) => unknown`。
- [ ] 参数转换显式。
- [ ] 没有代码内 default 覆盖 manifest default。
- [ ] 返回值可序列化。
- [ ] 错误码明确。
- [ ] 实现没有超出 evidence。
