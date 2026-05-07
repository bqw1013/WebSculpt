# Browser Runtime 契约

> 适用于 `runtime: "browser"` 的 WebSculpt command。

## 1. 模块格式

入口文件为 `command.js`，必须使用标准 ESM default export。

```js
export default async function (page, params) {
  return {};
}
```

签名：

```text
async (page, params) => unknown
```

`page` 由 WebSculpt daemon 为本次执行创建。不要关闭注入的 `page`；daemon 会统一清理。

## 2. 参数

- runner 作为第二个参数传入 `params`。
- 所有参数值都是字符串。
- 数字使用 `parseInt` 或 `parseFloat`。
- 布尔值使用 `params.flag === "true"`。
- manifest 中已声明 default 的参数，不要在代码中写 `params.foo || "default"`。

## 3. 环境

Browser runtime 在 daemon 的 Node.js 进程中执行，并通过 `page` 操作浏览器。

可用：

- Playwright `page` API
- Node.js 内置模块

限制：

- 不要读写本地文件系统。
- 不要引入第三方模块。
- `console.log` 用户通常看不到，调试信息应通过返回值带出。
- 不要创建新浏览器实例。

## 4. 页面访问

常见结构：

```js
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(selector, { timeout: 15000 });

const items = await page.evaluate(() => {
  return [];
});
```

`networkidle` 不保证前端框架已完成渲染。提取 DOM 前应等待 evidence 中记录的稳定元素。

## 5. 选择器

优先使用 evidence 中验证过的稳定选择器或字段：

- 语义结构
- `data-testid`
- aria 属性
- 稳定 class
- API 响应字段

不要使用探索阶段的临时 snapshot ref。

## 6. 返回值

直接 `return` 可序列化纯数据。

如需调试，可临时返回：

```js
return {
  debug: { url: page.url(), title: await page.title() },
  items
};
```

正式命令中保留调试字段前，应确认它对调用者有价值。

## 7. 错误

业务错误应设置 `error.code`，并在消息中包含错误码：

```js
const error = new Error("[DRIFT_DETECTED] Expected result selector was not found");
error.code = "DRIFT_DETECTED";
throw error;
```

基础设施错误如 `BROWSER_ATTACH_REQUIRED`、`DAEMON_BUSY`、`COMMAND_TIMEOUT` 由 runner 或 daemon 产生，命令代码不需要抛出。

## 8. 检查清单

- [ ] 使用 `export default` 导出异步函数。
- [ ] 签名为 `async (page, params) => unknown`。
- [ ] 不关闭注入的 `page`。
- [ ] 参数转换显式。
- [ ] 没有代码内 default 覆盖 manifest default。
- [ ] 等待稳定元素后再提取数据。
- [ ] 没有使用临时 snapshot ref。
- [ ] 返回值可序列化。
- [ ] 实现没有超出 evidence。
