# WebSculpt CLI 命令参考

本文档是 WebSculpt CLI 的参考手册，覆盖所有 Meta 命令的用法、参数、输出契约及已知限制。扩展命令的编写规范见 [`src/compile/contract.md`](../src/compile/contract.md)。

WebSculpt CLI 是命令的发现、执行与管理入口。它面向人类用户和 AI Agent 提供同一套界面，核心能力分为两类：

- **Meta 命令**：管理 CLI 本身和命令库，如安装、创建、卸载命令。
- **扩展命令**：可复用的信息获取工作流，封装了"如何从特定网站或 API 获取信息"的逻辑。首次由 AI 探索沉淀，后续直接复用，无需重复消耗 Token。

## 1. 命令分类与解析规则

### 1.1 分类

| 分类 | 位置 | 说明 |
|------|------|------|
| **Meta（元命令）** | 系统内置 | 管理 CLI 本身和命令库，如 `config init`、`command list` |
| **Builtin（内置扩展命令）** | `src/cli/builtin/` | 随项目分发的默认能力或示例 |
| **User（用户自定义命令）** | `~/.websculpt/commands/` | 用户或 AI 在具体任务中沉淀的自定义工作流，可覆盖 builtin |

### 1.2 查找优先级

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **User** — 最高优先级，允许覆盖同名的 builtin 命令
2. **Builtin** — 项目内置的默认实现
3. **Meta** — 系统保留，不可覆盖

**关键规则**：

- Meta 命令的保留词不会被 User 或 Builtin 覆盖。
- User 与 Builtin 的冲突以 User 为准。

## 2. 扩展命令结构

一个扩展命令由以下文件组成：

| 文件 | 职责 | 是否必填 |
|------|------|----------|
| `manifest.json` | 元数据：描述命令用途、运行时、参数列表等 | 是 |
| `command.js`（或 runtime 对应入口） | 执行逻辑：实际的信息获取代码 | 是 |
| `README.md` | 面向调用者的文档：参数说明、返回值、调用示例 | 否（缺失时 warning） |
| `context.md` | 面向修复者的上下文：沉淀背景、页面结构、失效信号 | 否（缺失时 warning） |

**目录结构**：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js
  ├── README.md
  └── context.md
```

Builtin 命令的物理位置在 `src/cli/builtin/<domain>/<action>/`，结构与 User 命令一致。

**调用逻辑**：

输入 `websculpt <domain> <action>` 时，系统按优先级找到对应的命令目录，读取 `manifest.json` 了解参数和运行时，然后加载入口文件执行。

**草稿态与正式态**：

- `.websculpt-drafts/` 是 AI 的草稿工作区，允许试错。`command draft` 在此生成合规骨架。
- `~/.websculpt/commands/` 是系统的正式档案，只有通过 `command create` 闸机（L1-L3 校验）的命令才能进入。
- `draft` 不注入 `id`/`domain`/`action`；`create` 以 CLI 参数为权威强制注入这三个字段。

**`manifest.json` 关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 命令用途，必填且不能为空字符串 |
| `runtime` | `string` | `node`（默认）、`playwright-cli`、`shell`、`python` |
| `parameters` | `array` | 参数列表，元素为 `{ name, required?, default?, description? }` |

`id`、`domain`、`action` 为系统维护字段，由 `command create` 自动注入，草稿阶段无需填写。

## 3. 输出格式与全局选项

### 扩展命令

执行结果默认以 JSON 格式输出，便于程序化和 AI 消费；成功与失败均包含结构化字段（如 `success`、`data`、`error`、`code`、`meta` 等）。

### Meta 命令

默认以人类可读的文本输出（如简洁列表、状态提示），可通过全局选项切换为结构化 JSON：

```bash
websculpt --format json <meta-command>    # 或 -f json
```

**例外**：`skill status` 仅支持 human 可读输出，无 JSON 模式。

## 4. 元命令一览

### `config init`

初始化 `~/.websculpt` 目录结构，包含配置、命令库和日志文件。

```bash
websculpt config init
```

> **Limitation:** 生成的 `config.json` 目前仅作占位，业务代码尚未消费其中任何字段。

---

### `command list`

列出当前环境中所有可用的扩展命令，并标注来源（builtin / user）。

```bash
websculpt command list
```

---

### `command draft <domain> <action>`

生成合规的命令骨架目录。

```bash
websculpt command draft <domain> <action> [options]
```

| 选项 | 说明 |
|------|------|
| `--runtime <rt>` | `node`（默认）、`playwright-cli`、`shell`、`python` |
| `--to <path>` | 输出目录（默认 `.websculpt-drafts/<domain>-<action>/`） |
| `--param <spec>` | 预声明参数（可重复），如 `name:required`、`limit:default=10` |
| `--force` | 覆盖已存在的草稿目录 |

**关键行为**

- 保留域（`command`、`config`、`skill`）报错 `RESERVED_DOMAIN`；目标目录已存在且无 `--force` 时报错 `ALREADY_EXISTS`
- 生成 `manifest.json`（不含 `id`/`domain`/`action`）、入口文件、`README.md`、`context.md`
- `shell`/`python` 运行时会附带 `RUNTIME_NOT_EXECUTABLE` 警告（不可执行）

> **Limitation:** 仅输出确定性模板，不做 L1-L3 校验；修改后如需预检，调用 `command validate`。

---

### `command create <domain> <action>`

从目录创建用户自定义命令，安装到 `~/.websculpt/commands/<domain>/<action>/`。

```bash
websculpt command create <domain> <action> --from-dir <path> [options]
```

| 选项 | 说明 |
|------|------|
| `--from-dir <path>` | 源目录路径（**必填**） |
| `--force` | 覆盖已存在的同名命令 |

**关键行为**

- 保留域报错 `RESERVED_DOMAIN`；同名命令无 `--force` 时报错 `ALREADY_EXISTS`
- 以 CLI 参数为权威，强制覆盖/注入 manifest 的 `id`/`domain`/`action`
- 执行 L1-L3 分层校验，失败阻止落盘；无 `--skip-validation` 选项

> **Limitation:** `shell` 和 `python` 运行时目前无法实际执行。

---

### `command validate --from-dir <path> [domain] [action]`

预检命令包合规性，只校验不落盘。

```bash
websculpt command validate --from-dir <path> [domain] [action]
```

**关键行为**

- **不带 `[domain] [action]`**：校验 manifest 自洽性 + L2 合规 + L3 契约；`id`/`domain`/`action` 缺失时发 warning（`create` 会注入）
- **带 `[domain] [action]`**：额外校验注入后的完整状态（含一致性），模拟 `create` 的落盘预览
- 校验失败返回 `VALIDATION_ERROR` 及 details 列表；通过但有 warnings 时返回 `success: true` 并附带 `warnings`

---

### `command show <domain> <action>`

查看某个扩展命令的 `manifest.json` 详情。

```bash
websculpt command show <domain> <action>
```

> **未实现。** 调用返回 `NOT_IMPLEMENTED`。

---

### `command remove <domain> <action>`

卸载用户自定义命令，删除 `<domain>/<action>/` 目录，并在 domain 为空时自动清理父目录。

```bash
websculpt command remove <domain> <action>
```

**关键行为**

- 不能删除 builtin 命令（报错 `CANNOT_REMOVE_BUILTIN`）
- 目标命令不存在时报错 `NOT_FOUND`
- 删除后自动重建 registry index

---

### `skill install`

将内置的 WebSculpt skill 安装到 agent 目录。

```bash
websculpt skill install [options]
```

| 选项 | 说明 |
|------|------|
| `-g, --global` | 安装到全局 agent 目录（`~/.claude/skills/websculpt/` 等） |
| `-a, --agents <agents>` | 指定目标 agent，逗号分隔（`claude`、`codex`、`agents`、`all`） |
| `--from <path>` | 显式指定 skill 源目录，覆盖自动检测 |
| `--force` | 覆盖已存在的安装 |

**关键行为**

- 默认 local scope，自动扫描当前目录下已存在的 agent 目录；若无则报错 `AGENT_DIRS_NOT_FOUND`
- 未提供 `--force` 时，目标已存在则跳过（`skipped`）
- 按 agent 逐条报告结果（`installed` / `skipped` / `replaced`）

---

### `skill uninstall`

从 agent 目录移除 WebSculpt skill。

```bash
websculpt skill uninstall [options]
```

| 选项 | 说明 |
|------|------|
| `-g, --global` | 从全局 agent 目录卸载 |
| `-a, --agents <agents>` | 指定目标 agent |

**关键行为**

- 默认 local scope
- 按 agent 逐条报告结果（`removed` / `not_found`）
- 若所有目标均报告 `not_found`，命令以 exit code 1 退出

---

### `skill status`

查看各 agent 的 skill 安装状态。

```bash
websculpt skill status
```

**关键行为**

- 每行一个 agent，形如 `claude   1.2.0    local [global 1.0.0 present]`
- local 安装优先于 global；若 local 存在，额外标注 `[global X.X.X present]`

> **Limitation:** 纯 human 可读输出，无 JSON 模式。

## 5. 使用示例

### 5.1 调用一个 builtin 命令

```bash
websculpt example hello --name world
```

### 5.2 完整生命周期：从创建到卸载

从生成骨架到卸载一个自定义命令的完整流程：

```bash
# 1. 初始化环境（如未执行过）
websculpt config init

# 2. 生成骨架
websculpt command draft mysite fetch --runtime playwright-cli --param url:required

# 3. 编辑 .websculpt-drafts/mysite-fetch/ 下的业务逻辑

# 4. 预检合规性
websculpt command validate --from-dir .websculpt-drafts/mysite-fetch/

# 5. 安装到命令库
websculpt command create mysite fetch --from-dir .websculpt-drafts/mysite-fetch/

# 6. 确认已安装
websculpt command list

# 7. 调用命令
websculpt mysite fetch --url https://example.com

# 8. 卸载
websculpt command remove mysite fetch
```

## 6. 日志规则

扩展命令执行结果追加写入 `~/.websculpt/log.jsonl`，Meta 命令不写。目前无自动清理或轮转机制。
