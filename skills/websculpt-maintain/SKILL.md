---
name: websculpt-maintain
description: 用于维护、修复或迭代已安装的 WebSculpt 命令。当命令因目标网站结构变更、API 迁移而失效，或用户需要新增参数、修改输出格式时加载此 skill。本 skill 依赖 websculpt-capture 的状态机流转机制，必要时依赖 websculpt-explore 重新获取信息。
---

# WebSculpt Maintain

## 职责

你是 WebSculpt 的命令维护者。你的核心任务是：将已安装的命令反向导出为工作区，诊断并修改其中的所有相关文件，最终覆盖安装以完成修复或迭代。

`maintain` 本质上是带有初始上下文的 `capture` 流程。你必须严格遵守 Capture 的状态机驱动规则（status -> validate -> finalize）与测试门槛，不另造新机制。

## 强制依赖加载

为了确保遵循正确的规范，你**严禁凭记忆或臆测执行操作**：
1. 开始维护前，必须阅读 `websculpt-capture` skill，掌握其状态机循环、测试规范与 Draft 编写红线。
2. 若现有信息不足以完成修复（需要试探新页面结构等），必须阅读 `websculpt-explore` skill，并遵循其独立探索协议。

## 维护工作流

### 1. 导入工作区
将目标命令导入为可编辑的工作区：
```bash
websculpt capture import <domain> <action>
```

导入成功后，通读工作区根目录和 `draft/` 下的文件（特别是 `context.md`, `evidence.md`, `manifest.json` 和 `command.js`），理解命令的原始意图、核心依赖及当前逻辑。

### 2. 诊断与信息获取
根据用户的报错或迭代需求，判断现有上下文是否足以完成修改：
- **现有信息充足**：直接进入 Step 3 开始修改。
- **需要新信息**：
  加载 `websculpt-explore`，使用 `explore new` 创建独立的探索工作区获取新情报（如新选择器、新 API 端点）。探索完成后，**由你自行判断** `trace.md` 中的哪些新发现有价值。提取这些核心证据更新到 maintain 工作区的文件中（无需机械合并全文档，重点是让新事实有效指导本次修复）。

### 3. 修改与状态推进
根据诊断结果或新获取的情报，修改工作区的文件。你必须保持工作区文件的**全局一致性**，按需更新：
- `command.js`：更新核心逻辑、API 调用或选择器。
- `manifest.json`：若参数有增删改，必须同步调整。
- `README.md`：若参数或输出结构发生变化，必须更新面向使用者的说明文档。
- `evidence.md`：若验证了新的 URL 或结构事实，予以更新，保持代码与证据相符。
- `context.md`：若本次修复涉及特殊坑点（如反爬升级、绕过策略等），追加记录，为未来维护者留存上下文。

修改完成后，进入 Capture 状态驱动循环：
1. 反复执行 `websculpt capture status <workspace-name>`。
2. 遇到 `validation` block 时，执行 `websculpt capture validate <workspace-name>` 并按报错修正。
3. 直到系统报告所有 artifact 状态均为 `done`。

### 4. 覆盖安装与测试
所有状态 `done` 后，无需询问用户，直接执行覆盖安装：
```bash
websculpt capture finalize <workspace-name> --force
```

**安装完成后**，你必须按照 `websculpt-capture` 的测试要求，执行 **至少 4 组真实命令调用** 覆盖不同场景（Happy path、泛化、边界、错误处理）：

```bash
websculpt <domain> <action> [参数组合]
```
- **测试通过**：向用户交付维护结果（摘要说明修改点及验证情况）。
- **测试失败**：进入修复循环（分析报错 -> 再次修改文件 -> validate -> 再次 `finalize --force` -> 重新测试）。若修复尝试达 3 次仍失败，熔断并请求用户介入。

## 关键红线

- **禁止跳步**：必须经历完整的工作区修改、状态验证 (`validate`)、强制安装 (`finalize --force`) 和真实测试。禁止直接修改已安装的最终产物文件。
- **遵循前置契约**：编写 `command.js` 和 `manifest.json` 时，绝对遵守 `capture` skill 约定的 Runtime Contract、错误码规范及参数要求。
