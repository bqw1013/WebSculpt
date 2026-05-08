---
name: websculpt-capture
description: WebSculpt Capture 工作流。用于在 websculpt-explore 已完成信息获取并输出 Capture Assessment 后，创建 capture 工作区、编写 evidence.md、实现 draft 命令包、validate 并 finalize 安装到命令库。由 capture status 状态机驱动全流程。
---

# WebSculpt Capture

> 加载本 skill 后，必须先确认已有来自 `websculpt-explore` 的 Capture Assessment 或等价探索证据。没有已验证路径时，不得创建 capture。

## 角色

你是 WebSculpt 的 capture 负责人。你的任务是把一次已经跑通的信息获取路径，从创建工作区到安装命令，完整地沉淀为命令库资产。

整个流程由 `capture status` 状态机驱动。你不需要理解全局流程，只需要：**循环执行 `capture status`，按返回的 `next.action` 推进，直到 `readyToFinalize: true`。**

## 边界

本 skill 负责：

- 基于 Capture Assessment 创建 capture 工作区（`capture new`）。
- 按规范填写 `evidence.md`（含查重、Assessment、URL、选择器、参数、失败信号）。
- 基于 `evidence.md` 实现 `draft/command.js`。
- 编写 `draft/README.md`（面向调用者）和 `draft/context.md`（面向修复者）。
- 执行 `capture validate` 校验命令包。
- 向用户展示成果摘要，获得确认后执行 `capture finalize` 安装。

本 skill 不负责：

- 重新探索网页、API 或浏览器路径。
- 捕获未实际跑通的理论方案。
- 修复已安装命令。

## 协议

### 1. 创建工作区

基于 explore 的 Capture Assessment（或自行判断），执行：

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime>
```

`capture new` 会自动：
- 扫描命令库并记录查重结果到 `capture.yaml`
- 生成 `evidence.md` 模板（含命令库快照提示）
- 生成 `draft/` 骨架（manifest.json、command.js、README.md、context.md）

### 2. 立项汇报

根据 `capture new` 返回的 `commandLibrarySnapshot`，向用户汇报：
- 同 domain 命令列表
- 命名冲突及来源（user / builtin）
- 若冲突来源为 user，提示覆盖风险

请求用户确认是否继续推进。若用户拒绝，删除工作区并终止。

### 3. 状态驱动循环

**核心规则：每完成一个动作，必须重新执行 `capture status` 获取最新状态。**

```bash
websculpt capture status <name>
```

按返回的 `next.action` 推进：

| `next.action` | 你做什么 | 参考文档 |
|--------------|---------|---------|
| `fill-evidence` | 填写 `evidence.md` | `references/capture/evidence-contract.md` |
| `fill-command` | 实现 `draft/command.js` | `references/compile/contract.md` + runtime contract |
| `fill-readme` | 编写 `draft/README.md` | `references/compile/contract.md` |
| `fill-context` | 编写 `draft/context.md` | `references/compile/contract.md` |
| `validate` | 执行 `capture validate <name>` | - |
| `request-user-confirmation` | 向用户展示摘要并请求确认 | - |

### 4. 安装

用户确认后：

```bash
websculpt capture finalize <name>
```

## Evidence 写作规范

`evidence.md` 是跨 session 的唯一桥梁。必须按模板填写，**不得修改 6 个二级标题**。

### 固定标题结构

```markdown
# Evidence: {domain}/{action}

## 探索路径

### 命令库查重
<!-- 必填。基于 capture.yaml 中的命令库快照，记录查重过程和结论 -->

### 工具与 Guide
<!-- browser 运行时必填。记录已阅读 guide.md -->

## 已验证 URL
<!-- 必填。每个 URL 必须实际访问过并提取数据 -->

## 结构证据
<!-- 必填。DOM 选择器、JSON 字段、API 响应结构 -->

## 参数与样例
<!-- 必填。可参数化字段、取值范围、至少一组输入输出样例 -->

## 失败信号
<!-- 必填。失败路径、触发条件、环境依赖 -->

## Capture Assessment
<!-- 必填。是否建议沉淀、候选 domain/action、评估理由 -->
```

### 写作原则

- **只记录本次探索实际验证过的信息**，不写未验证设计。
- **查重必须引用 `capture.yaml` 中的客观数据**，不能瞎编"命令库为空"。
- **browser 运行时必须明确记录已阅读 guide.md**。
- **每个 URL 必须实际访问过并提取数据**，禁止写"可能可用"的 URL。
- **选择器必须具体**，不能只写"页面上有项目列表"。
- **失败信号必须写出具体触发条件**，不能只写"可能失败"。

### Audit 约束

写完 `evidence.md` 后必须执行 `capture status`。若返回 `evidence: blocked`，按 `missingDeps` 补充缺失内容。以下含糊表述会被系统判定为失败：

- "查了命令库" → 必须明确写出"`command list` 返回了 xxx"或"未发现相关命令"
- "用了浏览器" → 必须明确写出"已阅读 `references/access/playwright-cli/guide.md`"
- "页面结构稳定" → 必须写出具体选择器和样例输出
- "可能失败" → 必须写出具体失败信号和触发条件

## Draft 实现规范

### command.js

- **必须基于 `evidence.md` 中已验证的路径实现**，禁止凭空发明选择器、endpoint 或参数。
- **遵守 runtime contract**：`node` 或 `browser` 的签名、参数、返回值和错误处理规范。
- **返回可序列化纯数据**，不返回 HTML 或原始页面片段。
- **使用已定义业务错误码**表达可预期失败。

### README.md

- **面向调用者**，说明参数、返回值、用法、错误码。
- **不泄露 DOM 选择器、反爬策略或维护细节**。
- **使用探索时已验证的输入输出作为示例**。

### context.md

- **面向未来修复者**。
- **记录**：Capture Background、Value Assessment、Page/API Structure、Environment Dependencies、Failure Signals、Repair Clues。
- **不重复 README 的参数用法说明**。

## 用户确认

`capture status` 返回 `next.action: "request-user-confirmation"` 时，向用户展示摘要并请求确认：

```markdown
命令 `{domain}/{action}` 已准备就绪，是否安装？

**Evidence 摘要**：
- 已验证 URL: ...
- 查重结果: ...
- 参数: ...
- 失败信号: ...

**Draft 概要**：
- Runtime: ...
- 核心逻辑: ...

确认安装？（确认后将执行 `capture finalize`）
```

**禁止在未获得用户显式确认前执行 `capture finalize`。**

## 完成条件

一次 capture 完成时，应具备：

- `capture new` 已执行，工作区已创建。
- `evidence.md` 通过 audit（结构 + 内容）。
- `draft/command.js` 已实现，且基于 evidence 中的已验证路径。
- `draft/README.md` 和 `draft/context.md` 已编写。
- `capture validate` 通过。
- 用户已确认，且 `capture finalize` 成功安装到命令库。
