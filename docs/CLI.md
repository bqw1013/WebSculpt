# WebSculpt CLI 命令参考

本文档是 WebSculpt CLI 的参考手册，覆盖所有 Meta 命令的用法、参数、输出契约及已知限制。扩展命令的编写规范见 `skills/websculpt-capture`下的文档。

WebSculpt CLI 是命令的发现、执行与管理入口。它面向人类用户和 AI Agent 提供同一套界面，核心能力分为两类：

- **Meta 命令**：管理 CLI 本身和命令库，如安装、创建、卸载命令。
- **扩展命令**：可复用的信息获取工作流，封装了"如何从特定网站或 API 获取信息"的逻辑。首次由 AI 探索沉淀，后续直接复用，无需重复消耗 Token。

## 1. 命令分类与解析规则

### 1.1 分类

| 分类 | 位置 | 说明 |
|------|------|------|
| **Meta（元命令）** | 系统内置 | 管理 CLI 本身和命令库，如 `config init`、`command list`、`scope show` |
| **Builtin（内置扩展命令）** | `src/cli/builtin/` | 随项目分发的默认能力或示例 |
| **User（用户自定义命令）** | `~/.websculpt/commands/` | 用户或 AI 在具体任务中沉淀的自定义工作流，可覆盖 builtin |

### 1.2 查找优先级

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **User** — 最高优先级，允许覆盖同名的 builtin 命令
2. **Builtin** — 项目内置的默认实现

**关键规则**：

- Meta 命令（`capture`、`command`、`config`、`daemon`、`explore`、`scope`、`skill`）在系统层面直接注册，不参与扩展命令扫描，因此不会被 User 或 Builtin 覆盖。
- User 与 Builtin 的冲突以 User 为准。

## 2. 扩展命令结构

一个扩展命令由以下文件组成：

| 文件 | 职责 | 是否必填 |
|------|------|----------|
| `manifest.json` | 元数据：描述命令用途、运行时、参数列表等 | 是 |
| `command.js`（或 runtime 对应入口） | 执行逻辑：实际的信息获取代码 | 是 |
| `README.md` | 面向调用者的文档：参数说明、返回值、调用示例 | 否（缺失时 warning） |
| `context.md` | 面向修复者的上下文：沉淀背景、复用价值、页面结构、失效信号 | 否（缺失时 warning） |
| `evidence.md` | 探索证据：已验证 URL、选择器、失效信号等（capture 路径 finalize 时复制） | 否（路径 A 无此文件） |

**目录结构**：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js
  ├── README.md
  ├── context.md
  └── evidence.md
```

Builtin 命令的物理位置在 `src/cli/builtin/<domain>/<action>/`，结构与 User 命令一致。

**调用逻辑**：

输入 `websculpt <domain> <action>` 时，系统按优先级找到对应的命令目录，读取 `manifest.json` 了解参数和运行时，然后加载入口文件执行。

**创建路径**

扩展命令可通过两条路径创建：

| 路径 | 命令系列 | 草稿位置 | 特点 |
|------|---------|---------|------|
| **A：直接创建** | `command draft / validate / create` | `.websculpt-drafts/` | 人工编写或脚本化场景，自主控制流程 |
| **B：沉淀工作流** | `capture new / status / validate / finalize` | `.websculpt/captures/<name>/draft/` | Agent 驱动，额外要求 `evidence.md` 和状态机推进；底层复用 `command` 的校验与安装能力，增加 evidence 审计和 draft 指纹防篡改 |

`~/.websculpt/commands/` 是系统的正式档案，只有通过校验的命令才能进入。草稿阶段的 `manifest.json` 不注入 `id`/`domain`/`action`；安装时以 CLI 参数为权威强制注入。

**`manifest.json` 关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 命令用途，必填且不能为空字符串 |
| `runtime` | `string` | `node`（默认）、`browser`、`shell`、`python` |
| `parameters` | `array` | 参数列表，元素为 `{ name, required?, default?, description? }` |
| `prerequisites` | `string[]` | 可选，命令特定的前置条件说明 |
| `requiresBrowser` | `boolean` | 是否需要浏览器环境；`browser` 运行时必须为 `true`，其他运行时必须为 `false` |
| `authRequired` | `string` | 可选，命令是否需要登录/认证：`"required"`、`"not-required"`、`"unknown"`（默认） |

`id`、`domain`、`action` 为系统维护字段，由 `command create` 自动注入，草稿阶段无需填写。`requiresBrowser` 由 `command draft` 和 `capture new` 根据所选运行时自动推导，通常无需手动修改。

## 3. 输出格式与全局选项

### 扩展命令

执行结果默认以 JSON 格式输出，便于程序化和 AI 消费；成功与失败均包含结构化字段（如 `success`、`data`、`error`、`code`、`meta` 等）。

### Meta 命令

默认以人类可读的文本输出（如简洁列表、状态提示），可通过全局选项切换为结构化 JSON：

```bash
websculpt --format json <meta-command>    # 或 -f json
```

## 4. 元命令一览

### 4.1 `config`

#### `config init`

初始化 `~/.websculpt` 目录结构，包含配置、命令库和日志文件。

```bash
websculpt config init
```

> **Limitation:** 生成的 `config.json` 目前仅作占位，业务代码尚未消费其中任何字段。

---

### 4.2 `daemon`

管理后台浏览器 daemon 进程。`browser` 运行时的扩展命令实际由该 daemon 执行。

#### `daemon status`

查询 daemon 健康与资源状态。

```bash
websculpt daemon status
```

**输出字段**

| 字段 | 说明 |
|------|------|
| `pid` | 进程 ID |
| `uptime` | 运行时长（秒） |
| `healthy` | 整体健康状态 |
| `degraded` | 是否处于降级模式（内存告警或达到重启阈值时置为 true） |
| `browser.connected` | 浏览器是否已连接 |
| `browser.pages` | 当前打开页签数 |
| `sessions.active` | 当前活跃会话数 |
| `sessions.max` | 最大并发会话数 |
| `resources.rssMB` | 进程 RSS 内存（MB） |

human 模式下会同时格式化输出当前生效的资源限制配置。

**关键行为**

- daemon 未运行时报错 `DAEMON_NOT_RUNNING`
- daemon 在运行但健康端点不可达时报错 `DAEMON_UNREACHABLE`

---

#### `daemon logs [--lines <n>]`

显示 daemon 日志文件最近条目。

```bash
websculpt daemon logs [--lines <n>]
```

| 选项 | 说明 |
|------|------|
| `--lines <n>` | 显示行数，默认 50 |

日志不存在或无法读取时报错 `NO_LOGS_AVAILABLE`。

---

#### `daemon start`

启动后台 daemon（如尚未运行）。

```bash
websculpt daemon start
```

已运行且健康时返回提示，不会重复启动。

---

#### `daemon restart`

重启后台 daemon。先执行优雅停止，等待 500ms 后启动新实例，确保操作系统释放 socket 等资源。

```bash
websculpt daemon restart
```

---

#### `daemon stop`

停止运行中的 daemon 进程。

```bash
websculpt daemon stop
```

**关键行为**

- 向 daemon 发送优雅停止请求，并等待进程退出
- 若进程未响应，执行强制终止并清理状态文件
- 目标进程不存在时返回"Daemon was not running"

失败时返回 `DAEMON_STOP_FAILED`（仅当进程抵抗强制终止时）。

---

### 4.3 `command`

#### `command list`

列出当前环境中可用的扩展命令，并标注来源（builtin / user）。

默认情况下，若当前工作目录或其祖先目录存在 `.websculpt/scope.json`，仅返回白名单内的命令；无 scope 时返回全部。使用 `--all` 可绕过 scope 过滤。

```bash
websculpt command list [--all]
```

| 选项 | 说明 |
|------|------|
| `--all` | 显示全部命令，忽略 scope 白名单 |

---

#### `command draft`

生成合规的命令骨架目录。

```bash
websculpt command draft <domain> <action> [options]
```

| 选项 | 说明 |
|------|------|
| `--runtime <rt>` | `node`（默认）、`browser`、`shell`、`python` |
| `--to <path>` | 输出目录（默认 `.websculpt-drafts/<domain>-<action>/`） |
| `--param <spec>` | 预声明参数（可重复），如 `name:required`、`limit:default=10` |
| `--force` | 覆盖已存在的草稿目录 |

**关键行为**

- 保留域（`command`、`config`、`skill`、`daemon`、`capture`、`scope`、`explore`）报错 `RESERVED_DOMAIN`；目标目录已存在且无 `--force` 时报错 `ALREADY_EXISTS`
- 生成 `manifest.json`（不含 `id`/`domain`/`action`）、入口文件、`README.md`、`context.md`
- `shell`/`python` 运行时会附带 `RUNTIME_NOT_EXECUTABLE` 警告（不可执行）

> **Limitation:** 仅输出确定性模板，不做 L1-L3 校验；修改后如需预检，调用 `command validate`。

---

#### `command create`

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

#### `command validate`

预检命令包合规性，只校验不落盘。

```bash
websculpt command validate --from-dir <path> [domain] [action]
```

**关键行为**

- **不带 `[domain] [action]`**：校验 manifest 自洽性 + L2 合规 + L3 契约；`id`/`domain`/`action` 缺失时发 warning（`create` 会注入）
- **带 `[domain] [action]`**：额外校验注入后的完整状态（含一致性），模拟 `create` 的落盘预览
- 校验失败返回 `VALIDATION_ERROR` 及 details 列表；通过但有 warnings 时返回 `success: true` 并附带 `warnings`

---

#### `command show`

查看某个扩展命令的完整契约卡片，包含元数据、参数、运行时前置条件和资产完整性。

```bash
websculpt command show <domain> <action> [options]
```

| 选项 | 说明 |
|------|------|
| `--include-readme` | 将命令目录下的 `README.md` 原文追加到输出中 |

**输出字段**

| 字段 | 说明 |
|------|------|
| `id` / `domain` / `action` | 命令身份 |
| `description` | 命令用途 |
| `runtime` | 执行运行时 |
| `source` | 来源（`builtin` / `user`） |
| `parameters` | 完整参数契约（含 `required`、`default`、`description`） |
| `prerequisites` | 合并后的前置条件（系统级 + 命令级） |

**关键行为**

- 命令不存在时报错 `NOT_FOUND`
- `prerequisites` 自动合并运行时系统前置条件与 `manifest.prerequisites`
- `--include-readme` 为 opt-in：默认不读取 `README.md`

---

#### `command remove`

卸载用户自定义命令，删除 `<domain>/<action>/` 目录，并在 domain 为空时自动清理父目录。

```bash
websculpt command remove <domain> <action>
```

**关键行为**

- 不能删除 builtin 命令（报错 `CANNOT_REMOVE_BUILTIN`）
- 目标命令不存在时报错 `NOT_FOUND`
- 删除后自动重建 registry index

---

#### `command export`

将当前可见的扩展命令导出为一个可移植的目录包，便于在不同 WebSculpt 安装之间共享或通过 Git 版本管理。

```bash
websculpt command export [identifiers...] --to <dir> [--force]
```

| 选项 | 说明 |
|------|------|
| `--to <dir>` | 导出目标目录（**必填**） |
| `--force` | 覆盖非空目标目录 |

| 参数（定位参数） | 说明 |
|------|------|
| `[identifiers...]` | 可选，要导出的命令标识符，可混合域和命令：`domain`（导出该域下全部命令）或 `domain/action`（导出单个命令）。省略时导出全部可见命令 |

**导出包结构**

```
<dir>/
  ├── index.json          ← commands 数组
  └── commands/
      └── <domain>/
          └── <action>/
              ├── manifest.json
              ├── command.js
              ├── README.md      （如存在）
              ├── context.md     （如存在）
              └── evidence.md    （如存在）
```

**关键行为**

- 导出以 User 覆盖 Builtin 后的最终生效视图为准（等价于 `command list --all`，不受 scope 白名单限制）
- 未匹配到任何命令时返回错误 `NO_COMMANDS_MATCHED`
- 目标目录已存在且非空，且未使用 `--force` 时返回错误 `DIRECTORY_NOT_EMPTY`；`--force` 会清空目标目录后重新写入
- 导出的命令中包含 `evidence.md` 时，结果附带 `EVIDENCE_INCLUDED` warning，提醒用户在分享前检查内容

---

#### `command import`

将导出的命令包安装到本地用户命令库。

```bash
websculpt command import --from <dir> [--force] [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--from <dir>` | 导出包目录路径（**必填**） |
| `--force` | 覆盖已存在的同名用户命令 |
| `--dry-run` | 仅校验和报告冲突，不写入任何文件，不修改 registry |

**关键行为**

- 包目录下必须存在 `commands/` 子目录，否则返回错误 `MISSING_COMMANDS_DIR`
- 如果包目录下存在 `index.json`，其 `commands` 数组必须与 `commands/` 下的实际目录完全一致，否则返回错误 `INDEX_MISMATCH`
- 如果不存在 `index.json`，import 会直接扫描 `commands/` 目录发现命令
- 导入前对所有命令执行 L1–L3 分层校验：任一命令校验不通过则整体终止，不写入任何文件，返回 `VALIDATION_ERROR` 及 per-command 错误详情
- 保留域命令（`command`、`config`、`skill`、`daemon`、`capture`、`scope`、`explore`）在校验阶段被拒绝
- 同名用户命令已存在时：默认跳过（状态 `skipped`），`--force` 覆盖（状态 `overwritten`）
- `--dry-run` 模式下不执行任何写入操作，也不重建 registry index

**结果状态**

导入结果中每个命令会标记状态：

| 状态 | 说明 |
|------|------|
| `installed` | 新安装的命令 |
| `overwritten` | 使用 `--force` 覆盖的已有命令 |
| `skipped` | 已存在且未使用 `--force` 而跳过的命令 |

---

### 4.4 `explore`

管理 explore 工作区，为 Agent 的探索阶段提供文件系统真实性和 CLI 硬约束。

```bash
websculpt explore new <name> --intent <intent> [--force]
websculpt explore assess <name>
```

| 子命令 | 作用 |
|--------|------|
| `new` | 创建工作区，生成 `explore.yaml` 和 `trace.md` 模板 |
| `assess` | 审计 `trace.md` 的结构完整性和安全规则，将结果写入 `explore.yaml` |

**选项**

| 选项 | 说明 |
|------|------|
| `--intent <intent>` | `new` 必填，探索目标的描述 |
| `--force` | `new` 覆盖已存在工作区 |

**关键行为**

- `explore new` 要求名称匹配 `^[a-z0-9-]+$`，否则报错 `INVALID_EXPLORE_NAME`
- 工作区已存在且无 `--force` 时报错 `EXPLORE_ALREADY_EXISTS`
- `explore assess` 工作区不存在时报错 `NOT_FOUND`
- `trace.md` 缺失时报错 `EXPLORE_AUDIT_FAILED`
- 审计逻辑：L1（5 个强制 H2 标题）→ L2（内容非空）→ L3（关键词安全规则）→ Assessment H3 子节完整性检查

---

### 4.5 `capture`

管理命令沉淀工作区，将已验证的信息获取路径转换为可复用的扩展命令。

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime> [--force]
websculpt capture import <domain> <action> [--name <name>]
websculpt capture restore <workspace-name>
websculpt capture status <name>
websculpt capture validate <name>
websculpt capture finalize <name> [--force]
```

| 子命令 | 作用 |
|--------|------|
| `new` | 创建工作区，生成 `capture.yaml`、`evidence.md` 和 `draft/` 骨架 |
| `import` | 将已安装的命令反向导入为 capture 工作区，用于修改或维护已有命令 |
| `restore` | 从工作区的 `backup/` 恢复已安装命令到 `capture import` 时的快照 |
| `status` | 查询工作区状态，返回 6 个 artifact 的完成度、`readyToFinalize` 和 `next.action` |
| `validate` | 预检 draft 合规性，通过后写入带指纹的 `validation.json` |
| `finalize` | 安装到命令库；仅在 `status` 返回 `readyToFinalize: true` 时才可执行 |

**选项**

| 选项 | 说明 |
|------|------|
| `--domain <domain>` | `new` 必填，目标命令 domain |
| `--action <action>` | `new` 必填，目标命令 action |
| `--runtime <runtime>` | `new` 必填，`node` / `browser` / `shell` / `python` |
| `--name <name>` | `import` 可选，自定义工作区名称（默认 `<domain>-<action>-<YYMMDD>`，碰撞时自动加 `-1`、`-2` 后缀） |
| `--force` | `new` 覆盖已存在工作区；`finalize` 覆盖已有 user 命令 |

**关键行为**

- `import` 查找优先级：User > Builtin；被导入命令必须包含 `evidence.md`，否则报错 `EVIDENCE_MISSING`
- `import` 成功后会将原命令复制到工作区的 `backup/` 目录，并在 `capture.yaml` 中记录 `sourceType`（`user` 或 `builtin`）
- `restore` 根据 `sourceType` 回滚：用户命令用 `backup/` 覆盖安装目录；内置命令删除用户覆盖使其重新生效
- 工作区不存在、缺少 `sourceType` 或缺少 `backup/` 时，`restore` 分别报错 `NOT_FOUND`、`WORKSPACE_NOT_RESTORABLE`、`BACKUP_NOT_FOUND`
- `import` 成功后工作区所有 artifact 预置为 `done`，`capture status` 直接返回 `nextAction: finalize`
- 修改 imported 工作区的 draft 文件后，指纹失效，`capture status` 会让 `validation` 回退到 `blocked`，需重新执行 `validate → finalize --force`

详细的状态机与校验逻辑见 [`Capture.md`](./Capture.md)。

---

### 4.6 `skill`

#### `skill install`

将内置的 WebSculpt skills 安装到 agent 目录。

```bash
websculpt skill install [name] [options]
```

| 参数 | 说明 |
|------|------|
| `name` | 可选，指定单个 skill 名称（如 `capture`、`explore`、`scope`）；省略则安装所有内置 skills |

| 选项 | 说明 |
|------|------|
| `-g, --global` | 安装到全局 agent 目录 |
| `-a, --agents <agents>` | 指定目标 agent，逗号分隔（`claude`、`codex`、`agents`、`all`） |
| `--from <path>` | 显式指定 skill 源目录，覆盖自动检测 |
| `--lang <lang>` | 语言版本：`en`（默认）或 `zh` |
| `--force` | 覆盖已存在的安装 |

**关键行为**

- 默认 local scope，自动扫描当前目录下已存在的 agent 目录；若无则报错 `AGENT_DIRS_NOT_FOUND`
- 未提供 `--force` 时，目标已存在则跳过（`skipped`）
- 按 agent + skill 逐条报告结果（`installed` / `skipped` / `replaced`）

---

#### `skill uninstall`

从 agent 目录移除 WebSculpt skills。

```bash
websculpt skill uninstall [name] [options]
```

| 参数 | 说明 |
|------|------|
| `name` | 可选，指定单个 skill 名称（如 `capture`、`explore`、`scope`）；省略则移除所有 `websculpt-*` skills |

| 选项 | 说明 |
|------|------|
| `-g, --global` | 从全局 agent 目录卸载 |
| `-a, --agents <agents>` | 指定目标 agent |

**关键行为**

- 默认 local scope
- 按 agent + skill 逐条报告结果（`removed` / `not_found`）
- 若所有目标均报告 `not_found`，命令以 exit code 1 退出

---

#### `skill status`

查看各 agent 的 skill 安装状态。

```bash
websculpt skill status
```

**关键行为**

- 按 agent 分组，逐 skill 报告安装状态（`installed` / `not installed`）及生效范围（`local` / `global`）
- local 安装优先于 global

---

### 4.7 `scope`

管理项目级命令可见性。通过在当前目录维护 `scope.json` 白名单，控制 `command list` 和 CLI 帮助中显示的扩展命令。

```bash
websculpt scope init
websculpt scope destroy
websculpt scope show
websculpt scope add <identifier>
websculpt scope remove <identifier>
```

| 子命令 | 作用 |
|--------|------|
| `init` | 在当前目录初始化 scope（创建 `.websculpt/scope.json`） |
| `destroy` | 销毁当前目录的 scope |
| `show` | 显示当前生效的 scope 配置及白名单有效性 |
| `add` | 将命令加入白名单；`identifier` 可为 `domain/action` 或 `domain`（批量添加该域下全部命令） |
| `remove` | 将命令从白名单移除；支持 `domain/action` 或 `domain`（批量移除该域下全部命令） |

#### `scope init`

在当前目录初始化 scope。

```bash
websculpt scope init
```

**关键行为**

- 在当前目录创建 `.websculpt/scope.json`（白名单初始为空）
- 已存在时报错 `SCOPE_ALREADY_EXISTS`

---

#### `scope destroy`

销毁当前目录的 scope。

```bash
websculpt scope destroy
```

**关键行为**

- 仅删除当前目录的 `.websculpt/scope.json`，不删除祖先目录的 scope
- 不存在时报错 `NO_SCOPE_FOUND`

---

#### `scope show`

显示当前生效的 scope 配置。

```bash
websculpt scope show
```

**关键行为**

- 从当前目录向上遍历，显示最近一个 `scope.json` 的白名单及每条命令的可用状态（`valid`）
- 无 scope 时返回提示"No scope configured in this directory. All commands are visible."

---

#### `scope add <identifier>`

将命令加入当前生效的 scope 白名单。

```bash
websculpt scope add <identifier>
```

| 参数 | 说明 |
|------|------|
| `identifier` | `domain/action` 或 `domain`（批量添加该域下全部现有命令） |

**关键行为**

- 操作对象为向上遍历找到的**最近**一个 scope
- 无 scope 时报错 `NO_SCOPE_FOUND`
- 重复的命令自动去重

---

#### `scope remove <identifier>`

将命令从当前生效的 scope 白名单中移除。

```bash
websculpt scope remove <identifier>
```

| 参数 | 说明 |
|------|------|
| `identifier` | `domain/action` 或 `domain`（批量移除该域下全部命令） |

**关键行为**

- 操作对象为向上遍历找到的**最近**一个 scope
- 无 scope 时报错 `NO_SCOPE_FOUND`

## 5. 使用示例

### 5.1 调用一个 builtin 命令

```bash
websculpt github list-trending
```

### 5.2 查看帮助

使用 `--help` 查看全局帮助或指定命令的帮助。

```bash
websculpt --help
websculpt github --help
websculpt github list-trending --help
```

---

### 5.3 创建扩展命令：两条路径对比

以创建 `mysite fetch` 命令为例。两条路径最终都安装到 `~/.websculpt/commands/mysite/fetch/`，命令包结构完全一致。

**路径 A：直接创建（`command` 系列）**

适合人工编写或已知明确需求的场景。

```bash
# 1. 生成骨架
websculpt command draft mysite fetch --runtime browser --param url:required

# 2. 编辑 .websculpt-drafts/mysite-fetch/ 下的业务逻辑

# 3. 预检并安装
websculpt command validate --from-dir .websculpt-drafts/mysite-fetch/ mysite fetch
websculpt command create mysite fetch --from-dir .websculpt-drafts/mysite-fetch/
```

**路径 B：沉淀工作流（`capture` 系列）**

适合 Agent 驱动，要求记录探索证据并通过状态机逐步推进。

```bash
# 1. 创建工作区
websculpt capture new mysite-fetch --domain mysite --action fetch --runtime browser

# 2. 状态驱动循环：按 capture status 返回的 next.action 逐步推进
websculpt capture status mysite-fetch   # → fill-evidence
# 编辑 evidence.md
websculpt capture status mysite-fetch   # → fill-command
# 编辑 draft/command.js
# ... 继续按 status 推进直到 finalize

# 3. 校验并安装
websculpt capture validate mysite-fetch
websculpt capture finalize mysite-fetch
```

**路径 C：反向导入（`capture import`）**

适合修改或维护已有命令。从命令库反向重建 capture 工作区，保留原始 `evidence.md`，draft 文件预填充为当前安装版本。

```bash
# 1. 反向导入
websculpt capture import mysite fetch --name mysite-maintain

# 2. 修改 draft/ 文件...

# 3. 校验并安装（修改后需重新校验）
websculpt capture status mysite-maintain    # → validate（如果 draft 被修改过）
websculpt capture validate mysite-maintain
websculpt capture finalize mysite-maintain --force

# 4. 若修复失败，回滚到导入时的快照
websculpt capture restore mysite-maintain
```

### 5.4 调用与卸载

```bash
# 调用
websculpt mysite fetch --url https://example.com

# 查看全部已安装命令
websculpt command list

# 卸载
websculpt command remove mysite fetch
```

## 6. 日志规则

扩展命令执行结果追加写入 `~/.websculpt/log.jsonl`，Meta 命令不写。目前无自动清理或轮转机制。
