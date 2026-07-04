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

此签名必须与 `capture new` 生成的模板保持一致，不得改为命名导出、普通函数声明或调整参数顺序。

`page` 由 WebSculpt daemon 为本次执行创建。不要关闭注入的 `page`；daemon 会统一清理。

## 2. 参数

`params` 作为第二个实参传入命令函数，所有值均为字符串。数字使用 `parseInt` 或 `parseFloat`，布尔值使用 `params.flag === "true"`。

manifest 中已声明 `default` 的参数，不要在代码中写 fallback（如 `params.foo || "default"`）。

代码中访问的 `params.xxx` 必须在 `manifest.json` 的 `parameters` 中声明，否则 `capture validate` 会报 `UNDECLARED_PARAM` 错误。

## 3. 环境

Browser runtime 在 daemon 的 Node.js 进程中执行。daemon 通过 `connectOverCDP` 连接用户已有的 Chrome 或 Edge 实例，不会启动新浏览器，也不使用无头模式；连接是惰性的，仅在首次执行 browser runtime 命令时才会尝试建立。此连接与 explore 阶段使用的 `@playwright/cli` 相互独立，不共享 attach 会话。

命令加载后，daemon 为其创建一个位于浏览器默认上下文中的新 `page` 并注入命令函数。该页面复用用户的登录态、Cookie 和 LocalStorage；命令执行完成后由 daemon 自动关闭，因此命令代码不应自行关闭 `page`。

daemon 通过动态 `import()` 加载命令模块，并用时间戳查询参数绕过 ESM 缓存，修改 `command.js` 后重新执行即可生效。命令执行超时为 20 分钟（错误码 `COMMAND_TIMEOUT`），不是 5 秒；5 秒仅是 daemon 自身优雅关闭的兜底超时，与命令执行无关。

可用能力包括 Playwright `page` API、Node.js 内置模块和全局 `fetch`。

注意：`page.evaluate(callback)` 在浏览器进程中执行，不能使用 Node.js 模块或 `require`/`import`。

限制：

- `console.log` 输出到 daemon 进程，CLI 用户通常看不到；调试信息应通过返回值带出。

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

开发调试时，可临时通过返回值带出调试信息：

```js
return {
  debug: { url: page.url(), title: await page.title() },
  items
};
```

正式命令中应移除调试字段，或确认它对调用者有价值。

## 6. 错误

业务错误应设置 `error.code`，并在消息中包含错误码。若未设置，命令失败时会 fallback 到 `COMMAND_EXECUTION_ERROR`。

```js
const error = new Error("[DRIFT_DETECTED] Expected result selector was not found");
error.code = "DRIFT_DETECTED";
throw error;
```

基础设施错误如 `BROWSER_ATTACH_REQUIRED`、`DAEMON_BUSY`、`COMMAND_TIMEOUT` 由 runner 或 daemon 产生，命令代码不需要抛出。

## 性能与稳定性建议

以下建议来自实际 capture 中的常见观察，可帮助减少超时和不稳定问题，但请根据实际站点特征判断适用性。

### 页面加载超时

若命令在 `page.goto()` 阶段频繁超时，可考虑：

1. 将 `waitUntil` 从默认的 `"load"` 改为 `"domcontentloaded"`，避免等待第三方广告/追踪脚本。
2. 配合 `page.waitForSelector(targetSelector)` 等待目标元素稳定出现，而非等待全部资源加载完成。

## 复用 Explore 验证结果

若本命令经过 explore 阶段验证，编写 `command.js` 时应优先参考已验证的路径，避免凭猜测重新发明选择器、交互流程或等待策略。explore 与 capture 的浏览器连接相互独立，但页面行为规律是一致的——在 explore 阶段验证有效的逻辑，在 daemon 中通常同样有效。

## 7. 检查清单

### 代码质量

- [ ] 使用 `export default` 导出异步函数。
- [ ] 签名为 `async (page, params) => unknown`。
- [ ] 不关闭注入的 `page`。
- [ ] 参数转换显式。
- [ ] 没有代码内 default 覆盖 manifest default。
- [ ] 等待稳定元素后再提取数据。
- [ ] 返回值可序列化。
- [ ] 错误码明确。
- [ ] 实现没有超出 evidence。
- [ ] 保留模板生成的箭头函数签名和 `page` / `params` 参数顺序。
- [ ] 已消除所有 `TODO:` 标记及占位返回值（如 `return { ok: true };`）。

### 合规约束

- [ ] 代码不超过 1000 行。
- [ ] 无临时 snapshot 引用。
- [ ] 无 inline dynamic import。
- [ ] 只导入 Node.js 内置模块。
- [ ] 所有 `params.xxx` 已在 manifest 中声明。
