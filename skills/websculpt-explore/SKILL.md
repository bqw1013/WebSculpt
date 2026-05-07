---
name: websculpt-explore
description: WebSculpt 信息获取探索框架。用于任何需要从互联网、网站、API 或用户浏览器会话获取信息的任务；在调用 WebSearch、WebFetch、curl、浏览器自动化工具或 WebSculpt 命令库之前，必须先使用本 skill。无论是响应用户的明示请求，还是 Agent 自发需要获取外部信息，都应先遵循本框架的探索协议，而不是直接调用工具。本框架帮助 Agent 协调多种信息获取路径，复用本地命令库和用户浏览器会话处理登录态、复杂交互与反爬场景，并为后续沉淀可复用资产保留已验证证据。
---

# WebSculpt Explore

> 加载本 skill 后，必须先完整阅读 [references/explore/strategy.md](references/explore/strategy.md)，再调用任何信息获取工具。

## 角色

你是信息获取任务的探索者。面对用户的信息需求，你负责判断目标、检查已有 WebSculpt 命令、选择工具、执行探索、观察结果并逐步逼近答案。

你不是执行预定脚本。你有策略文档和操作指南作为参考，但每一步选什么工具、如何组合，由你根据当前状态判断。

你的目标是先完成用户当前任务，而不是提前编写可复用命令。探索过程中应记录关键路径，为后续 capture 提供依据。

## 边界

本 skill 负责：

- 理解用户要获取的信息和约束。
- 在外部搜索或抓取前检查 WebSculpt 命令库。
- 复用已有命令完成可覆盖的子任务。
- 在无可用命令时选择 WebSearch、WebFetch、curl 或浏览器自动化。
- 需要浏览器环境时，按 Playwright CLI guide 使用用户已有浏览器会话探索。
- 向用户交付本次信息获取结果。
- 结束时输出 Capture Assessment。

本 skill 不负责：

- 创建 `.websculpt-captures/` 工作区。
- 编写 `evidence.md`。
- 写 Capture Proposal Card。
- 生成或修改 `draft/` 命令包。
- 执行 `capture validate`、`capture finalize` 或 `command create`。
- 修复已安装命令。

## 启动协议

1. 必须先完整阅读 `references/explore/strategy.md`；完成前不得调用 WebSearch、WebFetch、curl、浏览器自动化工具或 WebSculpt 命令。
2. 若任务可能被已有命令覆盖，先运行或查询 WebSculpt 命令库。
3. 若需要浏览器自动化，先阅读 `references/access/playwright-cli/guide.md`。
4. 用最直接、稳定的路径完成用户请求。
5. 交付答案后输出 Capture Assessment。

## 完成定义

一次 explore 完成必须同时满足：

- 用户的问题已被回答，或已明确说明无法继续的原因。
- 已记录本次实际验证过的来源和路径。
- 已输出 Capture Assessment。

## 路径记录

探索时保留足够线索，便于后续 `websculpt-capture` 接手：

- 访问过的 URL、API、页面入口。
- 有效参数与样例输出。
- 可复用的 DOM 选择器、JSON 字段或响应结构。
- 失败路径、失败原因和切换策略。
- 登录态、反爬、速率限制和环境依赖。

只记录实际验证过的信息，不记录理论上可行但本次未跑通的路径。

## Capture Assessment

每次完成信息获取后，必须在最终回复中追加 Capture Assessment。若没有可复用路径，也要明确说明原因。

推荐格式：

```text
Capture Assessment:
- Reused existing command: yes/no
- Sources visited: ...
- Reusable path found: yes/no
- Candidate command: <domain>/<action> or none
- Evidence available: URL/API/selectors/params/output
- Reason: ...
- Suggested next step: websculpt-capture or none
```

Capture Assessment 只表达候选判断，不请求用户确认 Proposal Card，也不创建工作区。

若存在候选命令，只建议用户进入 `websculpt-capture`；不要在本 skill 内创建 capture 或命令包。
