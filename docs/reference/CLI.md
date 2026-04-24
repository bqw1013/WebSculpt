# WebSculpt CLI 文档

## 1. CLI 定位

CLI 是 Agent 经验沉淀与复用框架的交互界面。它不仅是命令的发现、执行与管理入口，更是 Agent 将过去任务中探索出的经验沉淀为可复用代码、并在后续任务中约束自身使用这些沉淀下来的代码的系统。人类用户和 AI 共享同一套命令库。

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

### `command draft <domain> <action>`

- **状态**：已实现
- **解决什么问题**：生成一个合规的命令骨架目录，让 Agent 从正确的结构起点开始编写业务逻辑，避免手动创建目录和记住各 runtime 的签名差异。
- **输出目录**：默认 `.websculpt-drafts/<domain>-<action>/`，可通过 `--to <path>` 自定义。
- **生成文件**：
  - `manifest.json`：预填结构（不含 `id`/`domain`/`action`，由 `create` 注入）
  - `command.js`（或 `command.sh`/`command.py`）：按 runtime 生成的最小合规骨架（签名 + TODO 注释）
  - `README.md`：文档模板
  - `context.md`：文档模板
- **选项**：
  - `--runtime <runtime>`：指定运行时，`node`（默认）、`playwright-cli`、`shell`、`python`
  - `--to <path>`：自定义输出目录
  - `--param <spec>`：预声明参数（可重复），格式为 `name:required` 或 `name:default=value`
  - `--force`：覆盖已存在的草稿目录
- **关键规则**：
  - `domain` 为 `command` 或 `config` 时返回 `RESERVED_DOMAIN` 错误。
  - 若目标目录已存在，无 `--force` 时返回 `ALREADY_EXISTS`。
  - draft 的输出是确定性模板拼接，不调用 `validateCommandPackage` 做自我校验。Agent 修改后如需预检，显式调用 `command validate`。
- **设计说明**：
  - `draft` 不是校验器，也不是落盘命令。它生成**已知合规的骨架目录**，让 Agent 从正确的结构起点开始编写业务逻辑。
  - `--param` 为可选 convenience：不提供时生成空 `parameters` 的 manifest 和纯骨架代码；提供时在 manifest 和 command.js 中预填参数声明与存取代码，保证跨文件一致性。
- **使用示例**：
  ```bash
  websculpt command draft zhihu articles --runtime playwright-cli --param author:required --param limit:default=10
  websculpt command create zhihu articles --from-dir .websculpt-drafts/zhihu-articles/
  ```

### `command create <domain> <action> --from-dir <path>`

- **状态**：已实现
- **解决什么问题**：从目录创建用户自定义命令，安装到 `~/.websculpt/commands/<domain>/<action>/`。
- **源目录结构**：
  - `manifest.json`：命令元数据（id、domain、action、description、parameters、runtime 等）
  - `description` 为必填字段，不能为空字符串或仅含空白字符
  - `command.js`（或 runtime 对应入口文件）：命令执行代码
  - `README.md`（可选）：文档
  - `context.md`（可选）：上下文说明
- **关键规则**：
  - `domain` 为 `command` 或 `config` 时返回 `RESERVED_DOMAIN` 错误。
  - 若目标命令已存在，需加 `--force` 才能覆盖。
  - `runtime` 支持 `node`（默认）、`shell`、`python`、`playwright-cli`，会根据运行时生成对应扩展名的入口文件。
  - **不设 `--from-file`**：沉淀工作流中命令资产始终为多文件目录形态，`create` 只消费 `--from-dir`。
- **当前限制**：`shell` 和 `python` 运行时目前无法实际执行。

### `command validate --from-dir <path> [domain] [action]`

- **状态**：已实现
- **解决什么问题**：预检命令包的合规性，只校验不落盘，供 AI 在调用 `command create` 前调试。
- **行为区分**：
  - **不带 `[domain] [action]`**：校验 manifest 内部自洽性 + L2 合规 + L3 契约。`id`/`domain`/`action` 缺失时发 `warning`（因为 `create` 会注入）。
  - **带 `[domain] [action]`**：额外校验注入后的完整状态（含 `id`/`domain`/`action` 一致性），模拟 `create` 的落盘预览。
- **返回格式**：与 `command create` 的校验结果一致。`success: true` 时可能附带 `warnings` 数组；`success: false` 时返回 `VALIDATION_ERROR` 及 details 列表。

### `command show <domain> <action>`

- **状态**：占位实现
- **解决什么问题**：查看某个扩展命令的 `manifest.json` 详情，帮助用户或 AI 理解命令的用途和参数签名。
- **当前限制**：尚未实现详情展示，返回 `NOT_IMPLEMENTED` 错误（默认 human 模式下为文本提示，JSON 模式下为结构化错误对象）。

### `command remove <domain> <action>`

- **状态**：已实现
- **解决什么问题**：卸载用户自定义命令，删除 `<domain>/<action>/` 目录，并在 domain 为空时自动清理父目录。
- **当前限制**：不能删除 builtin 命令；若目标命令不存在，返回 `NOT_FOUND` 错误码；若删除操作因权限等文件系统原因失败，返回 `REMOVE_ERROR`。

### `skill install`

- **状态**：已实现
- **解决什么问题**：将内置的 WebSculpt skill 安装到 agent 目录（`.claude/`、`.codex/`、`.agents/`），使 AI agent 能够读取策略文档和参考资料。
- **默认行为**：local scope，自动扫描当前目录下已存在的 agent 目录并安装；若当前目录没有任何 agent 目录，返回 `AGENT_DIRS_NOT_FOUND` 错误。
- **选项**：
  - `-g, --global`：安装到全局 agent 目录（`~/.claude/skills/websculpt/` 等）。
  - `-a, --agents <agents>`：指定目标 agent，逗号分隔（`claude,codex,agents,all`）。
  - `--from <path>`：显式指定 skill 源目录，覆盖自动检测。
  - `--force`：覆盖已存在的安装。
- **关键规则**：
  - 未提供 `--force` 时，若目标已存在则跳过并报告 `skipped`。
  - 安装结果按 agent 逐条报告（`installed` / `skipped` / `replaced`）。

### `skill uninstall`

- **状态**：已实现
- **解决什么问题**：从 agent 目录移除 WebSculpt skill。
- **默认行为**：local scope，移除当前目录下各 agent 的 skill 安装。
- **选项**：
  - `-g, --global`：从全局 agent 目录卸载。
  - `-a, --agents <agents>`：指定目标 agent。
- **关键规则**：
  - 按 agent 逐条报告结果（`removed` / `not_found`）。
  - 若所有目标均报告 `not_found`，命令以 exit code 1 退出。

### `skill status`

- **状态**：已实现
- **解决什么问题**：快速查看各 agent 的 skill 安装状态，包括版本、生效 scope 以及是否存在全局副本。
- **输出格式**：每行一个 agent，形如 `claude   1.2.0    local [global 1.0.0 present]` 或 `agents   not installed`。
- **关键规则**：
  - local 安装优先于 global；若 local 存在，会额外标注 `[global X.X.X present]`。
  - 纯人类可读输出，无 JSON 模式。

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
