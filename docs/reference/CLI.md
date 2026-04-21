# WebSculpt CLI 文档

## 1. CLI 定位

CLI 是 Agent 经验固化与复用框架的交互界面。它不仅是命令的发现、执行与管理入口，更是 Agent 将过去任务中探索出的经验固化为可复用代码、并在后续任务中约束自身使用这些固化代码的系统。人类用户和 AI 共享同一套命令库。

## 2. 命令分类与查找优先级

### 命令分类

| 分类 | 位置 | 说明 |
|------|------|------|
| **Meta（元命令）** | 系统内置 | 管理 CLI 本身和命令库，如 `config init`、`command list` |
| **Builtin（内置扩展命令）** | `src/cli/builtin/` | 随项目分发，作为默认能力或示例 |
| **User（用户自定义命令）** | `~/.websculpt/commands/` | 用户或 AI 创建的扩展命令，可覆盖 builtin |

### 查找优先级

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **User** — 最高优先级，允许覆盖同名的 builtin 命令
2. **Builtin** — 项目内置的默认实现
3. **Meta** — 系统保留，不可覆盖

**关键规则**：
- Meta 命令的保留词不会被 User 或 Builtin 覆盖。
- User 与 Builtin 的冲突以 User 为准。

## 3. 扩展命令的结构

一个扩展命令（无论是 Builtin 还是 User）由两部分组成：

- `manifest.json`：描述命令的元数据（id、domain、action、参数列表、runtime 等）
- `command.js`：命令的实际执行逻辑，默认导出一个异步函数

**目录结构**：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  └── command.js
```

Builtin 命令的物理位置在 `src/cli/builtin/<domain>/<action>/`，结构与 User 命令一致。

## 4. 元命令一览

### `config init`

- **状态**：已实现
- **解决什么问题**：为新用户初始化 `~/.websculpt` 目录结构，包含配置、命令库和日志文件。
- **当前限制**：生成的 `config.json` 目前仅作占位，业务代码尚未消费其中的任何字段。

### `command list`

- **状态**：已实现
- **解决什么问题**：发现当前环境中所有可用的扩展命令，并明确标注来源（builtin / user），帮助用户和 AI 快速了解工具箱里有什么。

### `command create <domain> <action> --from-file <path>`

- **状态**：已实现
- **解决什么问题**：从 JSON 包文件创建用户自定义命令，安装到 `~/.websculpt/commands/<domain>/<action>/`。
- **包文件结构**：
  - `manifest`：命令元数据（id、domain、action、parameters、runtime 等）
  - `code`：命令执行代码字符串
  - `readme`（可选）：README.md 内容
  - `context`（可选）：上下文说明，会写入 context.md
- **关键规则**：
  - `domain` 为 `command` 或 `config` 时返回 `RESERVED_DOMAIN` 错误。
  - 若目标命令已存在，需加 `--force` 才能覆盖。
  - `runtime` 支持 `node`（默认）、`shell`、`python`，会根据运行时生成对应扩展名的入口文件。
- **当前限制**：仅完成文件落盘和元数据校验；非 `node` 运行时目前无法实际执行。

### `command show <domain> <action>`

- **状态**：占位实现
- **解决什么问题**：查看某个扩展命令的 `manifest.json` 详情，帮助用户或 AI 理解命令的用途和参数签名。
- **当前限制**：尚未实现详情展示，返回 `NOT_IMPLEMENTED` 错误（默认 human 模式下为文本提示，JSON 模式下为结构化错误对象）。

### `command remove <domain> <action>`

- **状态**：已实现
- **解决什么问题**：卸载用户自定义命令，删除 `<domain>/<action>/` 目录，并在 domain 为空时自动清理父目录。
- **当前限制**：不能删除 builtin 命令；若目标命令不存在，返回 `NOT_FOUND` 错误码；若删除操作因权限等文件系统原因失败，返回 `REMOVE_ERROR`。

## 5. 扩展命令示例

### `example hello`

- **来源**：builtin
- **调用**：`websculpt example hello --name <value>`
- **作用**：返回一条带时间戳的问候语。
- **存在意义**：给开发者和 AI 提供一个最小可运行的扩展命令模板，展示 `manifest.json` 和 `command.js` 的基本结构与契约。

## 6. 参数与输出契约

### 参数设计

- **当前仅支持** `--key <value>` 形式的 options。
- **Positional arguments 的支持方式尚未确定。**

### 输出格式

- **扩展命令**：执行结果默认以 JSON 格式输出，便于程序化和 AI 消费；成功与失败均包含结构化字段（如 `success`、`data`、`error`、`code`、`meta` 等）。
- **Meta 命令**：默认以人类可读的文本输出（如简洁列表、状态提示），可通过全局选项 `--format <human|json>`（`-f` 简写）切换为结构化 JSON。

### 日志规则

- **扩展命令**执行后，结果会追加写入 `~/.websculpt/log.jsonl`。
- **Meta 命令**（如 `config init`、`command list`）不会写入日志。
- 目前尚无自动清理、轮转或大小限制机制。
