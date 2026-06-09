# WebSculpt

<p align="center">
  <img src="docs/assets/header-logo-black.png" width="100%" alt="WebSculpt">
</p>

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

<video src="https://github.com/bqw1013/WebSculpt/raw/master/docs/assets/WebSculpt-DeepSeek-Final-zh.mp4" controls width="100%"></video>

---

## 目录

- [1. 安装](#1-安装)
- [2. 用法](#2-用法)
- [3. Why WebSculpt](#3-why-websculpt)
- [4. 核心概念](#4-核心概念)
- [5. 关键设计选择](#5-关键设计选择)
- [6. 文档](#6-文档)
- [7. 使用声明](#7-使用声明)
- [8. License](#8-license)

---

## 1. 安装

**环境要求**：Node.js >= 22

```bash
# 1. 安装 CLI 工具
npm install -g @playwright/cli@0.1.12 websculpt

# 2. 为 Agent 安装 Skill（包含 explore、capture、scope）
websculpt skill install --lang zh       # 当前项目
# websculpt skill install --global --lang zh   # 全局生效
```

## 2. 用法

### 2.1 Agent 对话模式

安装 Skill 后，直接向 Agent 描述需求即可。Agent 会自动检查命令库、探索信息、评估是否值得沉淀。

**首次探索与沉淀**

> **你**：帮我查一下知乎热榜。
>
> **Agent**：本地命令库无匹配，开始访问知乎... 已定位热榜节点、提取数据。建议沉淀为 `zhihu/get-hot`，后续可直接调用。确认吗？
>
> **你**：确认。
>
> **Agent**：已沉淀。当前热榜数据：
> ```json
> [
>   { "rank": 1, "title": "...", "heat": "1200万" },
>   { "rank": 2, "title": "...", "heat": "980万" }
> ]
> ```

**复用已有命令**

> **你**（几天后）：帮我查一下知乎前5条热榜。
>
> **Agent**：已调用 `zhihu/get-hot --limit 5`。秒级返回，零额外 Token 消耗。

对于需要登录态的网站（如 GitHub、知乎个人页面），Agent 会自动连接你当前打开的 Chrome 浏览器，通过现有会话获取数据，无需重新登录。

### 2.2 CLI 手动模式

```bash
# 查看所有可用命令
websculpt command list

# 零依赖命令（无需浏览器）
websculpt bilibili get-hot --limit 5

# 浏览器命令（复用 Chrome 登录态，需保持浏览器打开）
websculpt zhihu get-hot --limit 5

# 元命令
websculpt daemon start|status|stop
websculpt command remove <domain> <action>
```

### 2.3 管理命令上下文（Scope）

随着命令库增长，可通过 Scope 限制当前项目可见的命令集合，保持 Agent 上下文纯净。

```bash
# 初始化项目级白名单（隔离全局命令）
websculpt scope init

# 添加当前项目需要的命令
websculpt scope add zhihu          # 添加整个域
websculpt scope add zhihu get-hot  # 或只添加单个命令
```

---

## 3. Why WebSculpt

**Agent 查网页没有记忆，每次都像第一次？**

同一个网站反复查，Agent 每次都要从头分析页面结构、试错选择器。上下文被探索过程占满，复杂点多页面跳转就中途断链。WebSculpt 把跑通的路径固化为本地命令，探索一次，永久复用，零重复成本，结果稳定可预期。

**配浏览器环境比让 Agent 干活还难？**

Playwright、Puppeteer、CDP 的配置文档看得头大，更不想把账号密码交给第三方云端 API。WebSculpt 收敛为单一协议，Agent 直接连接你当前打开的 Chrome，复用登录态和 Cookie，兼顾自动化与隐私。

**想把日常查询接入脚本或工作流？**

沉淀的命令输出结构化 JSON，可被脚本、CI 流程或其他系统直接调用，你的日常操作变成稳定 API。

## 4. 核心概念

**命令体系**

WebSculpt 有两类命令：
- **元命令**（Meta）：管理 CLI 本身和命令库，如 `explore`、`capture`、`command`、`skill`、`scope`。系统内置，不可被覆盖。
- **扩展命令**：可复用的信息获取工作流，按 `domain/action` 调用（如 `zhihu/get-hot`）。又分为：
  - **内置命令**（Builtin）：随 WebSculpt 分发
  - **用户命令**（User）：由 Agent 沉淀到 `~/.websculpt/commands/`。User 优先级高于 Builtin，同名时自动覆盖——命令库随使用持续进化。

**生命周期**

- **Explore**：Agent 获取信息的过程。先查本地命令库复用已有路径，无匹配时通过外部工具探索新路径。
- **Capture**：将验证过的路径固化为命令的过程。Agent 自动推进工作流，用户只需确认名称和输入输出。

**执行环境（运行时）**

- `node`：HTTP 请求与数据清洗，零依赖
- `browser`：通过 Playwright 连接你当前打开的 Chrome，复用你的登录态和 Cookie

**命令隔离（Scope）**

随着命令库增长，可通过 `scope` 将当前项目限制为仅可见特定命令集合，减少无关命令对 Agent 的干扰。Scope 配置存储在项目本地，全局命令默认被隔离，需显式添加后才可见。

---

## 5. 关键设计选择

### 三阶段 Skill 交付

WebSculpt 的完整功能被划分为三个前后衔接的 Skill，直接交付给用户的 Agent：
- `websculpt-explore`：信息获取阶段，发现可复用路径
- `websculpt-capture`：沉淀阶段，将验证过的路径固化为命令
- `websculpt-scope`：上下文管理阶段，隔离无关命令，保持 Agent 上下文纯净

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

## 6. 文档

**使用**
- [`docs/CLI.md`](docs/CLI.md) — 所有命令的用法、参数和输出契约

**设计与实现**
- [`docs/Capture.md`](docs/Capture.md) — 沉淀工作流：六 Artifact 流水线、状态机、硬门槛安装
- [`docs/Architecture.md`](docs/Architecture.md) — 系统四层架构与代码组织
- [`docs/Daemon.md`](docs/Daemon.md) — 后台浏览器进程、IPC 协议与资源管理

---

## 7. 使用声明

使用 WebSculpt 请遵守目标网站的 robots.txt 及服务条款，仅对允许访问的公开数据使用，禁止用于未经授权的数据采集。

## 8. License

Apache-2.0

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=bqw1013/WebSculpt&type=Date)](https://star-history.com/#bqw1013/WebSculpt&Date)
