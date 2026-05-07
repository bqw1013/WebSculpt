# WebSculpt Compile 契约

> 本文档定义从 capture evidence 到正式 command 资产的通用编译规则。选定 runtime 后，必须继续阅读对应运行时契约。

## 1. 主流程

标准流程：

```bash
websculpt capture status <name>
websculpt capture draft <name>
websculpt capture instructions command <name>
websculpt capture instructions readme <name>
websculpt capture instructions context <name>
websculpt capture validate <name>
websculpt capture finalize <name>
```

`command draft/validate/create` 是底层能力。只有 Capture CLI 不可用且用户明确同意过渡路径时，才直接使用底层 command 流程。

## 2. 事实来源

`evidence.md` 是唯一事实来源。

如果 evidence 缺少 endpoint、selector、参数、输出结构或环境依赖，不要自行探索补齐。停止并说明缺口，让用户回到 `websculpt-capture` 或 `websculpt-explore`。

## 3. Runtime 选择

| 需求 | runtime |
|------|---------|
| HTTP 请求、公开 API、数据清洗 | `node` |
| DOM 操作、页面导航、截图、复用登录态 | `browser` |
| 同时需要浏览器和本地文件系统 | 拆成多个命令，或要求用户确认边界 |

一个命令只能声明一种 runtime。不要在 compile 阶段为了方便混合职责。

## 4. manifest.json

`manifest.json` 由 draft 生成，compile 阶段只调整命令元数据和参数。

关键字段：

| 字段 | 说明 |
|------|------|
| `description` | 命令用途，不能为空 |
| `runtime` | `node` 或 `browser` |
| `parameters` | 参数列表，来自 evidence 的已验证输入 |
| `prerequisites` | 命令前置条件 |
| `requiresBrowser` | `browser` 为 true，`node` 为 false |
| `authRequired` | `required`、`not-required` 或 `unknown` |

`id`、`domain`、`action` 由 create/finalize 注入，不要在 draft 阶段手写依赖它们。

## 5. command.js

`command.js` 必须：

- 只实现 evidence 中验证过的获取路径。
- 使用运行时契约要求的函数签名。
- 返回可序列化纯数据。
- 用业务错误码表达可预期失败。
- 对数字和布尔参数做显式转换。
- 不使用 `params.foo || default` 形式覆盖 manifest default。

常用业务错误码：

| 错误码 | 场景 |
|--------|------|
| `AUTH_REQUIRED` | 需要登录 |
| `NOT_FOUND` | 目标资源不存在 |
| `EMPTY_RESULT` | 结果为空 |
| `MISSING_PARAM` | 缺少必填参数 |
| `DRIFT_DETECTED` | 页面/API 结构变化 |

## 6. README.md

README 面向调用者，回答“怎么用”。

应包含：

- Description
- Parameters
- Return Value
- Usage
- Common Error Codes

禁止包含：

- DOM selector
- API 维护细节
- 反爬策略
- 修复线索

## 7. context.md

context 面向未来修复者，回答“为什么这样实现、坏了怎么修”。

应包含：

- Capture Background
- Value Assessment
- Page/API Structure
- Environment Dependencies
- Failure Signals
- Repair Clues

禁止包含：

- 调用教程
- 参数用法示例
- README 已覆盖的调用者信息

## 8. Validate 与 Finalize

运行：

```bash
websculpt capture validate <name>
```

失败后按 validation details 修改 draft，并重复 validate，直到成功。

成功后运行：

```bash
websculpt capture finalize <name>
```

finalize 后，使用 evidence 中 verified 参数执行一次命令，确认输出符合预期。
