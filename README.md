# WebSculpt

WebSculpt 是一个面向 AI 时代的可扩展信息搜索命令行工具。它试图用确定性的执行层去组织 AI 在信息收集上的概率性能力。

## 项目阶段

当前处于非常早期的 **MVP 阶段（v0.0.1）**。CLI 骨架和命令扩展机制已完成，核心扩展能力（Web 访问、命令自动生成、异常自愈）尚未实现。

## 快速开始

```bash
npm install
npm run build
npx websculpt config init
npx websculpt command list
```

## 文档地图

| 文档 | 适合谁 | 内容 |
|------|--------|------|
| `DESIGN.md` | 想了解设计理念与长期方向的人 | 确定性 vs 概率性、AI 的三种角色、Harness 三层能力、当前边界 |
| `CLI.md` | 想了解命令体系与使用方式的人 | 命令分类、查找优先级、元命令卡片、参数与输出契约 |
| `KNOWN_ISSUES.md` | 贡献者 / Agent | 当前实现与设计理想之间的已知偏差 |
| `tests/README.md` | 想写代码或测试的人 | 测试分层与组织原则 |

## 核心概念

WebSculpt 将命令分为两类：

- **元命令（Meta）**：系统自带的管家命令，用于管理配置和命令库。
- **扩展命令（Extension）**：用户或 AI 创建的业务命令，以 `websculpt <domain> <action>` 的形式调用。

扩展命令的查找优先级为：用户自定义命令 > 内置命令 > 元命令。详细规则见 `CLI.md`。

## 命令速览

### 元命令

| 命令 | 状态 | 说明 |
|------|------|------|
| `websculpt config init` | ✅ 已实现 | 初始化 `~/.websculpt` 目录 |
| `websculpt command list` | ✅ 已实现 | 列出所有可用的扩展命令 |
| `websculpt command show <domain> <action>` | ⚠️ 占位 | 已注册，仅输出 "Not implemented yet" |
| `websculpt command remove <domain> <action>` | ✅ 已实现 | 删除用户自定义命令，保护内置命令 |

### 扩展命令

| 命令 | 来源 | 说明 |
|------|------|------|
| `websculpt example hello --name <value>` | builtin | 示例命令，返回问候语和时间戳 |

## 关键现状与约束

- **CLI 模块已收拢**：近期完成了一次重构，将原本分散在 `src/core`、`src/runner` 中的代码全部合并到 `src/cli/` 下，使其成为独立的入口适配器。
- **当前测试以 CLI e2e 为主**：这和项目目前的 MVP 形态一致，但后续能力下沉后，应逐步补齐 unit / integration 测试。
- **无 Web 访问能力**：尚未集成浏览器自动化或 HTTP 请求工具。
- **无命令生成能力**：AI 还无法通过 CLI 自动创建新的扩展命令。
- **无自愈能力**：当固化的命令因目标网站变更而失效时，暂无异常检测与自动修复机制。
- **命令参数目前仅支持 `--key <value>` 形式的 options**，不支持 positional arguments。
- **扩展命令默认以 JSON 格式输出**，便于程序和 AI 消费；**元命令默认以人类可读文本输出**，支持通过全局选项 `--format <human|json>`（`-f` 简写）切换为结构化 JSON。
- **`config.json` 当前仅作占位**：`config init` 会生成默认的 `config.json`，但业务代码目前尚未读取或消费其中的任何字段。
- **`log.jsonl` 的写入范围与生命周期有限**：只有扩展命令执行后会追加日志；元命令不会写入。此外，目前尚无自动清理、轮转或大小限制机制，长期使用文件会持续增长。
- **运行时支持不完整**：`command create` 允许声明 `runtime` 为 `shell` 或 `python` 并会生成对应扩展名的入口文件，但 `command-runner` 目前仅实现了 `node` 运行时，执行非 `node` 命令会返回 `Unsupported runtime` 错误。

## 常用脚本

```bash
# 开发运行
npm run dev

# 构建（tsc + 复制 builtin 命令到 dist）
npm run build

# 代码检查与自动修复
npm run check

# 格式化
npm run format

# 运行全部测试
npm run test

# 按测试层级运行
npm run test:unit
npm run test:integration
npm run test:e2e
```
