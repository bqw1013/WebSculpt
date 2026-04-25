---
name: websculpt
description: 互联网信息获取策略框架。当你需要从互联网获取信息来回答问题或做出判断时，优先使用本框架。这包括用户明示的请求，也包括你自发需要的信息收集。本框架自动协调多种工具以最优路径完成收集，支持复用用户浏览器会话处理登录态与复杂交互，并能沉淀成功路径为复用资产，节省 token、加速后续响应。
---

# WebSculpt

## 这是什么

WebSculpt 是一套信息获取框架，提供策略文档、工具能力和可复用的本地命令库。

## 你的角色

你是信息收集任务的决策者。面对需要从互联网获取信息的目标，你通过迭代选择工具、执行操作、观察结果，逐步逼近答案。

你不是执行预定脚本——你有策略文档和操作指南作为参考，但每一步选什么工具、如何组合，由你根据当前状态判断。

## 探索原则

- **策略先行**：动手前先阅读 [references/explore/strategy.md](references/explore/strategy.md)，获取工具选择、人机协作等决策依据
- **迭代逼近**：选择工具 → 执行 → 观察结果 → 决定是否继续、调整策略或切换工具
- **按需复用**：探索过程中，若命令库中存在能覆盖某个子任务的命令，直接调用而非重新实现。通过 `websculpt command list` 查看可用命令
- **终态觉察**：持续评估目标是否达成、当前路径是否有效、是否需要切换策略或请求用户介入

## 安装

若环境未就绪：

```bash
npm install -g websculpt
websculpt config init
```

## 边界约束

- 启动浏览器自动化前，须确认轻量方式已尝试或明确无效
- 探索中优先复用已有命令，不在同一目标上重复造轮子

## 沉淀

探索中遇到可以被复用的数据获取路径时，考虑将其沉淀为命令资产。

### 什么时候沉淀

优先沉淀那些你会再次使用的路径，而不是一次性脚本。判断标准：

- 换一组参数（比如换一个关键词、换一个用户 ID）是否仍然成立
- 实现是否依赖当前会话的临时状态（比如一次性验证码、临时 token）

粒度的判断权在你。一个只负责"获取文章列表"的小命令，往往比一个包含登录、搜索、清洗的完整脚本更有复用价值。

### 怎么沉淀

动手写之前，先读 [references/compile/contract.md](references/compile/contract.md)。里面规定了不同 runtime 的函数签名、参数怎么注入、错误怎么处理，以及 README 和 context 文档该怎么写。

然后按这个流程走：

```bash
# 生成骨架
websculpt command draft <domain> <action> --runtime <rt>

# 基于探索结果填充业务逻辑，并完善配套文档

# 预检是否合规
websculpt command validate --from-dir <path>

# 安装到命令库
websculpt command create <domain> <action> --from-dir <path>
```

命名上，domain 是目标服务或站点（如 `zhihu`、`github`），action 是操作（如 `fetch-posts`、`search-repos`）。
