# WebSculpt

WebSculpt 是一个面向 AI 时代的可扩展信息搜索命令行工具。它试图解决的核心问题是：将 AI 在信息收集上的"概率性探索"固化为可复用、可自愈的确定性 CLI 命令。

## 项目阶段

当前处于非常早期的 MVP 阶段（v0.0.1），CLI 骨架已搭建完成，核心扩展能力（Web 访问、命令自动生成、异常自愈）尚未实现。

## 技术栈

- **语言**：TypeScript（ES2022，NodeNext 模块解析）
- **运行时**：Node.js >= 20
- **CLI 框架**：Commander.js
- **代码质量**：Biome（lint + format）
- **测试框架**：Vitest（当前暂无测试文件）

## 核心概念

WebSculpt 将命令分为两类：

1. **元命令（Meta）**：系统自带的"管家命令"，用于管理配置和命令库。
2. **扩展命令（Extension）**：用户或 AI 创建的业务命令，以 `websculpt <domain> <action>` 的形式调用。

命令查找优先级：
1. 用户自定义命令（`~/.websculpt/commands/<domain>/<action>/`）
2. 内置命令（`src/cli/builtin/<domain>/<action>/`）
3. 元命令（系统保留，不可覆盖）

一个扩展命令由两部分组成：
- `manifest.json`：描述命令的元数据（id、domain、action、参数列表等）
- `command.js`：命令的实际执行逻辑，导出一个异步函数

## 已实现的命令

### 元命令

| 命令 | 状态 | 说明 |
|------|------|------|
| `websculpt config init` | ✅ 已实现 | 初始化 `~/.websculpt` 目录（配置、命令库、日志文件） |
| `websculpt command list` | ✅ 已实现 | 列出所有可用的扩展命令（区分 builtin / user） |
| `websculpt command show <domain> <action>` | ⚠️ 占位 | 已注册，仅输出"Not implemented yet" |
| `websculpt command remove <domain> <action>` | ⚠️ 占位 | 已注册，仅输出占位提示 |

### 扩展命令

| 命令 | 来源 | 说明 |
|------|------|------|
| `websculpt example hello --name <value>` | builtin | 示例命令，返回问候语和时间戳 |

## 项目结构

```
src/
  cli/
    index.ts                    # CLI 入口（commander 注册与路由）
    output.ts                   # JSON 输出工具
    meta/                       # 元命令 handler
      command.ts                # command list / show / remove
      config.ts                 # config init
    engine/                     # 命令发现与执行核心
      registry.ts               # 命令扫描、查找、聚合
      command-runner.ts         # 命令加载与运行（ESM 动态导入）
      paths.ts                  # CLI 相关路径定义
    builtin/                    # 内置扩展命令
      example/hello/            # 示例命令（manifest.json + command.js）
  infra/
    paths.ts                    # 全局路径（~/.websculpt 等）
    store.ts                    # 配置读写、日志追加
  types/
    index.ts                    # CommandManifest、CommandResult 等类型
openspec/
  config.yaml                   # OpenSpec 工作流配置
  changes/archive/              # 已完成的变更归档
  specs/                        # 规范目录（当前为空）
```

## 关键现状与约束

- **CLI 模块已收拢**：近期完成了一次重构，将原本分散在 `src/core`、`src/runner` 中的代码全部合并到 `src/cli/` 下，使其成为独立的入口适配器。
- **无 Web 访问能力**：尚未集成浏览器自动化或 HTTP 请求工具。
- **无命令生成能力**：AI 还无法通过 CLI 自动创建新的扩展命令。
- **无自愈能力**：当固化的命令因目标网站变更而失效时，暂无异常检测与自动修复机制。
- **命令参数目前仅支持 `--key <value>` 形式的 options**，不支持 positional arguments。
- **执行结果统一以 JSON 格式输出**，并追加写入 `~/.websculpt/log.jsonl`。

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

# 运行测试
npm run test
```

## 下一步方向（按优先级）

1. 完善元命令（`show`、`remove`）的实际实现。
2. 为 AI 提供命令创建接口（从探索到固化的闭环）。
3. 集成浏览器自动化或 HTTP 工具，增强多维探索能力。
4. 建立异常检测与自愈机制。
