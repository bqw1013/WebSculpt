# WebSculpt 架构详解

> 本文档面向开发者和 Agent，回答"系统如何组织、各层职责边界、如何交互、代码在哪里"。是设计总纲的技术展开。

---

## 当前阶段与已知边界

### 已实现

- **CLI 骨架**：基于 Commander.js 的 CLI 入口与命令路由。
- **命令扩展机制**：支持用户自定义命令（`~/.websculpt/commands/`）和内置命令（`src/cli/builtin/`）的分层查找。
- **元命令**：
  - `websculpt config init` — 初始化用户目录
  - `websculpt command list` — 列出可用命令
  - `websculpt command show <domain> <action>` — 已注册，功能尚未实现
  - `websculpt command remove <domain> <action>` — 删除用户自定义命令
  - `websculpt command create <domain> <action> --from-file <path>` — 将打包好的命令资产落盘到本地命令库
- **扩展命令示例**：`websculpt example hello` — 供开发者和 AI 参考的模板命令。
- **输出契约**：扩展命令默认以 JSON 输出（便于程序化和 AI 消费），并追加写入 `~/.websculpt/log.jsonl`；元命令默认以人类可读文本输出，可通过全局选项 `--format <human|json>`（`-f` 简写）切换为结构化 JSON。
- **运行时支持**：`node` 和 `playwright-cli` 已完全实现；`shell` 和 `python` 在 manifest 中可声明，但 runner 尚未支持。

### 不确定 / 未实现

- **Access 层**：当前以 `playwright-cli/guide.md` 文档约束为主要形式，对 AI 使用工具的行为进行限定。是否以及何时需要代码层封装，取决于实际约束强度需求。
- **自愈机制**：异常检测标准、修复触发条件、命令版本策略均未设计。
- **参数形态**：当前仅支持 `--key <value>` 形式的 options，positional arguments 的支持方式未定。
- **自然语言接口**：从自然语言到命令调用的翻译层尚未设计。
