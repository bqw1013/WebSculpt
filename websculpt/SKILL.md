---
name: websculpt
description: WebSculpt 的安装与引导入口。当需要获取或核验外部信息、抓取网页、调用 API、进行浏览器自动化或使用 WebSculpt 命令库，且当前环境 websculpt 命令不可用（未安装或已损坏）时，必须先使用本 skill 完成安装与引导，再开始信息获取。也用于用户显式要求安装、更新或修复 WebSculpt 的场景。若当前可用 skill 列表中已存在 websculpt-explore 等其他 WebSculpt 生命周期 skill，说明环境已就绪，请勿加载本 skill，直接使用对应的生命周期 skill。
---

# WebSculpt Bootstrap

## 什么时候该用 WebSculpt

WebSculpt 擅长两类事：进入登录墙或内容墙内获取信息；把高频重复的网页操作固化为 CLI 命令，此后一句话直接调用，不重复消耗模型上下文。典型场景：

- **自媒体博主 / 内容创作者**：下载抖音、小红书、B站视频素材；分析对标账号的发布节奏与爆款内容；采集评论区反馈做选题。
- **电商运营**：定期监控竞品店铺的价格、上新与销量变化，追踪竞品投放素材。
- **投研 / 金融从业者**：定期获取研报、公告与高频跟踪数据；量化方向还可采集舆情、社区情绪等另类数据。
- **咨询 / 行业研究**：跟踪行业动态，大量一手信息沉淀在小红书、知乎等内容平台内。
- **AI 从业者 / 研究者**：追踪 AI 产品与竞品动态，了解前沿技术进展，监控社区讨论热度。

以上只是示例。凡是“信息在墙内”或“操作高频重复”的场景，都适合 WebSculpt。

## 四个生命周期 skill

命令的完整生命周期是：探索发现 → 固化为命令 → 失效修复 → 整理迁移，各由一个 skill 负责：

- **websculpt-explore**：命令库里还没有现成命令时，用它探索并验证获取路径。绝大多数任务从这里开始。例如：

  ```
  /websculpt-explore 使用我的浏览器，帮我把 https://www.douyin.com/video/1234567890 这个视频下载下来
  /websculpt-explore 帮我调研一下 Perplexity 最近半年的功能更新，整理成时间线
  /websculpt-explore 用我登录的账号，把这个月小红书创作者中心的数据报表导出来
  ```

- **websculpt-capture**：explore 已把某条路径跑通、想固化为以后可直接调用的命令时，用它。通常由 explore 在验证通过后建议进入，无需手动触发。

- **websculpt-maintain**：已安装的命令失效、报错，或需要新增参数、调整输出时，用它修复。例如：

  ```
  /websculpt-maintain YouTube 视频下载的命令不能用了，帮我修复一下
  /websculpt-maintain 竞品价格监控命令这几天返回的都是空数据，看看怎么回事
  /websculpt-maintain 给微博热搜监控命令加个参数，只看前 10 条
  ```

- **websculpt-library**：命令太多想精简显示，或要备份、迁移、分享命令库时，用它。例如：

  ```
  /websculpt-library 帮我把各个视频平台的下载命令导出来，我要发给我朋友
  /websculpt-library 命令太多了，这个项目里只显示电商监控相关的
  /websculpt-library 我换了台新电脑，把之前备份的命令库导入进来
  ```

## 角色

本 skill 是 WebSculpt 的引导员，不是信息获取工具。它承担三个阶段性职责：

1. **安装器**（首次触发）：检查环境，安装 WebSculpt CLI 与四个生命周期 skill（explore / capture / maintain / library）。
2. **顶班路由**（安装完成的当前会话）：新装的 skill 尚未进入宿主的触发列表，你必须读取对应的已安装 skill 文件并遵循其协议，继续完成用户的任务。
3. **休眠恢复入口**（之后所有会话）：本 skill 不应再触发，生命周期 skill 已就位。仅在 WebSculpt 损坏（如 `websculpt: command not found`）或用户显式要求安装 / 更新 / 修复时醒来。

## 第一步：探测状态

加载本 skill 后，先探测，再决定动作，禁止直接安装：

```bash
websculpt --version
```

- 命令不可用（command not found）→ 执行「安装」。
- 命令可用 → 继续执行 `websculpt skill status`。该命令没有退出码语义，必须根据输出文本判断：每个 skill 一行的状态为 `installed local`、`installed global` 或 `not installed`（输出为英文，与 skill 语言无关）。
  - 四个生命周期 skill 均为 `installed local` 或 `installed global`，且用户无安装 / 更新 / 修复意图 → 直接进入「路由」，不要重装。
  - 有 skill 为 `not installed` → 执行 `npm install -g @playwright/cli@0.1.13` 与「安装」的第 3 步（安装生命周期 skill），然后进入「路由」。
- 用户显式要求更新 / 修复 → 进入「更新与修复」。

## 安装

### 1. 检查 Node.js

```bash
node --version
```

要求 >= 22。不满足时告知用户需要安装 Node.js 22 或更高版本，停止。

### 2. 安装 CLI 与浏览器工具

```bash
npm install -g @playwright/cli@0.1.13 websculpt
```

`@playwright/cli` 是 explore 阶段浏览器自动化的依赖，与 CLI 一并装妥。

若全局安装因权限失败（如 EACCES），不要使用 sudo——Windows 没有 sudo，且 sudo 安装会在 npm 全局目录留下 root 属主文件，导致后续所有 npm 操作持续报权限错误。改用 npx 兜底：后续所有 `websculpt` 命令加 `npx -y websculpt@latest` 前缀，所有 `playwright-cli` 命令加 `npx -y @playwright/cli@0.1.13` 前缀（包括下面的 skill install 与 status）。

### 3. 安装生命周期 skill

```bash
websculpt skill install --global --lang zh
```

该命令幂等，已存在的 skill 会跳过。全局安装会写入用户主目录下的 `.claude/skills/`、`.codex/skills/`、`.agents/skills/` 三个目录，宿主 agent 读取其中任一即可。

默认使用 `--global`。若用户明确只想在某个项目内使用，改为在该项目根目录执行 `websculpt skill install --lang zh`（不带 `--global`），前提是该目录下已存在 `.claude/`、`.codex/` 或 `.agents/` 之一。

### 4. 验证并汇报

```bash
websculpt skill status
```

确认四个生命周期 skill 均为 `installed local` 或 `installed global`。向用户简要汇报：CLI 版本、skill 安装位置（scope 与目录），以及后续会话将自动触发这些 skill。

## 路由

安装完成（或探测发现已就绪）后，继续完成用户的原始任务：

1. 确定任务所属阶段：获取外部信息 → `websculpt-explore`；沉淀已验证路径为命令 → `websculpt-capture`；修复或迭代失效命令 → `websculpt-maintain`；整理 / 迁移命令库 → `websculpt-library`。绝大多数任务从 explore 开始。
2. Read 已安装的对应 skill 文件并严格遵循其协议。按 `skill status` 输出的 scope 定位：`installed global` 位于用户主目录下的 `.agents/skills/<skill名>/SKILL.md`（`.claude/skills/`、`.codex/skills/` 下有相同副本）；`installed local` 位于当前项目目录下的同名路径。
3. 本会话内，当任何 websculpt skill 的协议要求加载另一个 websculpt skill（如 explore 建议进入 capture）时，同样以 Read 对应已安装 SKILL.md 文件的方式代替宿主触发。
4. 不要要求用户重启会话或重新表述任务，由你接管即可。

## 更新与修复

- 更新：`npm update -g websculpt`，然后 `websculpt skill install --global --lang zh --force` 刷新 skill，使其与新版本 CLI 保持一致。
- 修复：`websculpt` 命令缺失或损坏时，重新执行「安装」流程。
- `skill install` / `skill status` 报未知命令或未知选项时，说明 CLI 版本过旧：先 `npm update -g websculpt` 再重试。
- 单个已安装命令（某个 `domain/action`）失效不属于本 skill 职责，交由 websculpt-maintain 处理。

## 禁止

- 不得在探测（`websculpt --version` / `websculpt skill status`）之前执行任何安装命令。
- 不得在 CLI 与 skill 均已就绪时重复安装，或要求用户重启会话；直接路由继续任务。
- 不得使用 sudo 解决 npm 全局安装权限问题，统一走 npx 兜底。
- 不得手工编辑已安装的四个生命周期 skill 文件，它们由 `websculpt skill install --force` 统一刷新。
