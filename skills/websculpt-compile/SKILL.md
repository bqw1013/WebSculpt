---
name: websculpt-compile
description: WebSculpt 命令编译工作流。用于在 websculpt-capture 已创建 capture 工作区并完成 evidence.md 后，基于已验证证据生成 draft 命令包、实现 command.js、编写 README.md 和 context.md、运行 validate 并 finalize 到命令库；不负责重新探索、评估是否值得 capture 或修复已安装命令。
---

# WebSculpt Compile

> 加载本 skill 后，必须先确认已有 capture 工作区和完成的 `evidence.md`。`evidence.md` 是唯一事实来源；证据不足时，停止并交回 `websculpt-capture` 或 `websculpt-explore`。

## 角色

你是 WebSculpt 的命令编译负责人。你的任务是在 capture 证据约束内，把已验证路径工程化为合规、可安装、可复用的 WebSculpt command。

Compile 不判断值不值得沉淀，也不重新探索。它只回答：

- draft 是否已经生成？
- runtime contract 是否已经读取？
- `command.js` 是否只实现了 evidence 中验证过的路径？
- `README.md` 是否面向调用者？
- `context.md` 是否面向未来修复者？
- 命令包是否通过 validate，并可以 finalize？

## 边界

本 skill 负责：

- 读取 capture 状态和 `evidence.md`。
- 生成或恢复 draft 命令包。
- 根据 runtime contract 实现 `command.js`。
- 编写 `README.md` 和 `context.md`。
- 运行 validate，并根据错误修复。
- validate 成功后 finalize。
- 安装后使用 evidence 中的 verified 参数执行一次命令验证。

本 skill 不负责：

- 重新探索 URL、API、DOM 或浏览器页面。
- 发明 evidence 中没有的 endpoint、selector 或参数。
- 判断路径是否值得 capture。
- 创建 capture 工作区或编写 `evidence.md`。
- 修复已安装命令。
- 合并多个独立 capture。

## 启动协议

1. 确认用户提供 capture name。
2. 运行 `websculpt capture status <name>`。
3. 若 `evidence` 未完成，停止并说明需要先回到 `websculpt-capture`。
4. 阅读 [references/compile/contract.md](references/compile/contract.md)。
5. 运行 `websculpt capture draft <name>`。
6. 根据 runtime 阅读对应契约：
   - `node` 读 [references/compile/node-contract.md](references/compile/node-contract.md)
   - `browser` 读 [references/compile/browser-contract.md](references/compile/browser-contract.md)
7. 依次处理 artifact：`command` → `readme` → `context`。
8. 每个 artifact 先运行 `websculpt capture instructions <artifact> <name>`。
9. 运行 `websculpt capture validate <name>`，修复直到通过。
10. 运行 `websculpt capture finalize <name>`。
11. 安装后使用 evidence 中 verified 参数执行命令验证。

## Capture CLI 不可用时

如果当前项目尚未实现 Capture CLI，不要假装 `capture draft/validate/finalize` 可用。

在用户明确同意过渡路径后，可以回退到底层 command 流程：

```bash
websculpt command draft <domain> <action> --runtime <runtime>
websculpt command validate --from-dir <path> <domain> <action>
websculpt command create <domain> <action> --from-dir <path>
```

回退时仍必须以 `evidence.md` 为唯一事实来源，并在回复中明确说明这是过渡路径。

## 允许的工程化改写

允许：

- 把探索阶段的 `eval` 改写为 `page.evaluate()`。
- 把 curl 验证过的 API 改写为 Node `fetch`。
- 增加参数校验、错误码、等待条件和输出清洗。
- 把手动步骤转成稳定选择器和参数化逻辑。

不允许：

- 更换数据源。
- 更换 endpoint。
- 更换 selector 策略但没有 evidence 支撑。
- 增加 evidence 中没有验证过的新参数。
- 把多个 capture 合并成一个命令。

## Artifact 分工

`command.js` 面向机器执行，只实现 evidence 中验证过的路径，返回可序列化纯数据。

`README.md` 面向调用者，只写参数、返回值、用法和错误码；不得泄露 DOM selector、反爬策略或维护细节。

`context.md` 面向未来修复者，记录 Capture Background、Value Assessment、Page/API Structure、Environment Dependencies、Failure Signals 和 Repair Clues；不得重复 README 的调用教程。

## 完成条件

一次 compile 完成时，应具备：

- draft 命令包文件齐备。
- `command.js`、`README.md`、`context.md` 均由 evidence 支撑。
- `websculpt capture validate <name>` 成功。
- `websculpt capture finalize <name>` 成功。
- 安装后的命令已使用 verified 参数执行验证。
