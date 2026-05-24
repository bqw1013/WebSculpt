# WebSculpt

[![npm version](https://img.shields.io/npm/v/websculpt)](https://www.npmjs.com/package/websculpt)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/node/v/websculpt)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/websculpt)](https://www.npmjs.com/package/websculpt)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)

[English](README.md) · [中文](README_zh.md)

> **每次对话结束，Agent 的上网经验就清零了。**
>
> 下周再查同一个网站，从头摸索页面结构、反爬策略、登录流程——上下文被探索过程占满，真正该做的分析却放不下。

**WebSculpt 是 Agent 的程序性记忆。** 它记住的不是知识，而是"怎么从特定网站拿到数据"的成功经验。通过 Harness 约束探索行为，把跑通的路径沉淀为本地可复用的 `domain/action` 命令；后续直接调用，释放上下文空间。**命令库随使用不断进化，Agent 越用越聪明。**

![WebSculpt 工作流程](docs/assets/flow-zh.svg)

---

## 目录

- [1. 安装](#1-安装)
- [2. 用法](#2-用法)
- [3. Why WebSculpt](#3-why-websculpt)
- [4. 你可以这样用](#4-你可以这样用)
- [5. 核心概念](#5-核心概念)
- [6. 关键设计选择](#6-关键设计选择)
- [7. 文档](#7-文档)
- [8. 使用声明](#8-使用声明)
- [9. License](#9-license)

---

## 1. 安装

```bash
# 1. 安装 CLI 工具
npm install -g @playwright/cli@^0.1.8 websculpt

# 2. 为 Agent 安装 Skill
websculpt skill install --lang zh       # 当前项目
# websculpt skill install --global --lang zh   # 全局生效
```

## 2. 用法

### 核心用法

安装 Skill 后，直接向 Agent 描述需求即可。Agent 会自动检查命令库、探索信息、评估是否值得沉淀——你只需确认名称和输入输出，Agent 完成全部编码与安装。

> **你**：帮我查一下知乎热榜。
>
> **Agent**：正在分析页面结构、提取数据... 已完成查询。此外，这条路径已经跑通，建议沉淀为 `zhihu/get-hot` 命令，后续同一需求可直接调用。确认沉淀吗？
>
> **你**：确认。
>
> **Agent**：已沉淀完成。
>
> ---
>
> **你**：帮我查一下知乎热榜。
>
> **Agent**：已调用 `zhihu/get-hot`，秒级返回结果，不消耗额外token。

### 扩展命令快速体验

扩展命令分两类：一类直接运行即可，另一类需要连接 Chrome/Edge 浏览器会话。

```bash
# 先查看所有可用命令
websculpt command list

# 零依赖命令（无需浏览器）
websculpt bilibili get-hot --limit 5

# 浏览器命令（复用 Chrome/Edge 登录态）
# 1. 打开 Chrome 浏览器
# 2. 访问 chrome://inspect/#remote-debugging
# 3. 勾选 Allow remote debugging for this browser instance 并保持浏览器打开
websculpt zhihu get-hot --limit 5
```

### 元命令速查

```bash
# 手动启动后台浏览器进程（browser 命令通常自动启动，用于调试）
websculpt daemon start

# 查看 daemon 运行状态
websculpt daemon status

# 停止后台浏览器进程
websculpt daemon stop

# 卸载用户沉淀的命令
websculpt command remove <domain> <action>
```

---

## 3. Why WebSculpt

### 程序性记忆

每次对话结束，Agent 的上网经验就清零了。下周再查同一个网站，从头摸索页面结构、反爬策略、登录流程——上下文被探索过程占满，真正该做的分析却放不下。WebSculpt 把 Agent 成功的信息获取路径沉淀为本地可复用命令，形成持续进化的**程序性记忆**。

### 适用场景

1. **配个浏览器环境，比让 Agent 干活还难？**

   想操作网页，但 Playwright、Puppeteer、CDP 的配置文档看得头大，环境装了半天还是报错。

   WebSculpt 把浏览器自动化收敛为单一协议，Agent 直接连接你当前打开的 Chrome/Edge，复用你的登录态和 Cookie。**不需要理解底层工具链，描述需求即可。**

2. **同一个网站，每次都要重新教一遍？**

   Agent 每次查知乎热榜、GitHub 趋势，都要从头分析页面结构、试错选择器。上下文被探索占满，真正该做的分析却放不下。

   WebSculpt 内置一系列即用命令，安装后直接调用。遇到新网站，让 Agent 探索一次后自动沉淀为专属命令，**永久可用，零重复成本。**

3. **查个资料，Agent 烧了半条命还做不好？**

   Agent 现场分析 DOM、试错选择器，效果看运气，token 和上下文被快速占满。

   WebSculpt 把跑通的路径固化为命令，后续直接调用返回结构化 JSON。**零探索成本，结果稳定可预期。**

4. **稍微复杂点的浏览器任务，Agent 做到一半就迷失了？**

   多页面跳转、表单填写、数据提取，Agent 上下文不够用，中途断链。

   WebSculpt 支持把复杂流程拆解为多个原子命令，每个负责一个明确步骤。组合调用即可稳定完成复杂任务，**且每个步骤都可单独复用。**

5. **想把日常查询变成 CLI，接入自己的工作流？**

   经常查某个数据源，想把它变成命令行工具，但不知道从何下手。

   WebSculpt 沉淀的命令输出结构化 JSON，可被脚本、CI 流程或其他系统直接调用。**你的日常操作变成了可编程的 API。**

---

## 4. 你可以这样用

### 访问特定网站

> **你**：帮我查一下 B 站本周热门视频。
>
> **Agent**：命令库无匹配，开始直接访问 B 站官网...已完成查询。搜索结果往往混杂过时，而直接操作网站能拿到准确的结构化数据。这条路径已跑通，建议沉淀为 `bilibili/get-hot`，后续可直接调用。确认吗？
>
> **你**：确认。
>
> ---
>
> **你**：帮我查一下 B 站本周热门视频。
>
> **Agent**：已调用 `bilibili/get-hot`，秒级返回结构化数据，零额外 token 消耗。

### 连接已登录的浏览器

> **你**：帮我看一下我的 GitHub 通知。
>
> **Agent**：命令库无匹配，正在连接你的 Chrome...检测到浏览器当前已登录 GitHub，直接通过现有会话获取数据。建议沉淀为 `github/get-notifications`，**使用时需保持 Chrome 打开且处于登录状态**。确认吗？
>
> **你**：确认。
>
> ---
>
> **你**：帮我看一下我的 GitHub 通知。
>
> **Agent**：已调用 `github/get-notifications`。Chrome 当前处于登录状态，直接通过浏览器现有会话获取数据。

### 构建一个自己的命令

> **你**：帮我创建一个命令，每天监控这个商品的价格变化。
>
> **Agent**：开始探索目标页面...已确认价格选择器和页面结构。建议沉淀为 `shop/watch-price`，参数支持 `url` 和 `threshold`。确认吗？
>
> **你**：确认。
>
> ---
>
> **你**：这个商品现在多少钱？
>
> **Agent**：已调用 `shop/watch-price`，当前价格 ¥199。沉淀后的命令已进入命令库，后续同类需求会自动复用。

---

## 5. 核心概念

**命令体系**

WebSculpt 有两类命令：
- **元命令**（Meta）：管理 CLI 本身和命令库，如 `explore`、`capture`、`command`、`skill`。系统内置，不可被覆盖。
- **扩展命令**：可复用的信息获取工作流，按 `domain/action` 调用（如 `zhihu/get-hot`）。又分为：
  - **内置命令**（Builtin）：随 WebSculpt 分发
  - **用户命令**（User）：由 Agent 沉淀到 `~/.websculpt/commands/`。User 优先级高于 Builtin，同名时自动覆盖——命令库随使用持续进化。

**生命周期**

- **Explore**：Agent 获取信息的过程。先查本地命令库复用已有路径，无匹配时通过外部工具探索新路径。
- **Capture**：将验证过的路径固化为命令的过程。Agent 自动推进工作流，用户只需确认名称和输入输出。

**执行环境（运行时）**

- `node`：HTTP 请求与数据清洗，零依赖
- `browser`：通过 Playwright 连接你当前打开的 Chrome/Edge，复用你的登录态和 Cookie

---

## 6. 关键设计选择

### 两阶段 Skill 交付

WebSculpt 的完整功能被划分为两个前后衔接的 Skill，直接交付给用户的 Agent：
- `websculpt-explore`：信息获取阶段，发现可复用路径
- `websculpt-capture`：沉淀阶段，将验证过的路径固化为命令

这不是松散的使用建议，而是包含完整协议、状态约束和交付标准的交付物。

### Explore：文档软约束 + 文件系统真实

`websculpt-explore` 首先约束 Agent 的工具选择：必须优先查库复用内置命令，无匹配时才允许探索新路径；需要浏览器自动化时，收敛到 Playwright CDP 连接当前浏览器这一单一协议。

约束通过两种机制实现：
- **文档软约束**：Skill 文档定义协议流程，Agent 遵循规则执行
- **文件系统真实**：Agent 将探索痕迹写入 `trace.md`，`explore assess` 执行结构化审计（标题完整性、内容非空、关键词安全规则、Assessment H3 子节检查），未通过前禁止进入 capture

### Capture：CLI 状态检查 + Artifact 流水线

`websculpt-capture` 在 explore 的约束基础上，进一步引入 CLI 硬约束：
- Agent 无需理解完整流程，只需循环执行 `capture status`，按返回的 `next.action` 推进
- 沉淀过程被拆分为 6 个 Artifact，按严格分层依赖推进
- 通过 Evidence Audit、Draft Fingerprint 和 4 组真实测试建立硬门槛，未全部通过前无法 finalize

---

## 7. 文档

**使用**
- [`docs/CLI.md`](docs/CLI.md) — 所有命令的用法、参数和输出契约

**设计与实现**
- [`docs/Capture.md`](docs/Capture.md) — 沉淀工作流：六 Artifact 流水线、状态机、硬门槛安装
- [`docs/Architecture.md`](docs/Architecture.md) — 系统四层架构与代码组织
- [`docs/Daemon.md`](docs/Daemon.md) — 后台浏览器进程、IPC 协议与资源管理

---

## 8. 使用声明

使用 WebSculpt 请遵守目标网站的 robots.txt 及服务条款，仅对允许访问的公开数据使用，禁止用于未经授权的数据采集。

## 9. License

Apache-2.0

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=bqw1013/WebSculpt&type=Date)](https://star-history.com/#bqw1013/WebSculpt&Date)
