# 已知问题

本文档记录当前实现与理想设计之间的故意或已被接受的差距。

## 1. 元命令命名空间保护不够严格

**描述**

`command create` 元命令会拒绝在保留域 `command` 和 `config` 下创建用户命令（返回 `RESERVED_DOMAIN`）。

然而，如果用户手动将 manifest 和入口文件放到 `~/.websculpt/commands/command/<action>/` 或 `~/.websculpt/commands/config/<action>/`，CLI 的扫描器在启动时仍会将其发现并注册。这意味着可以通过跳过官方创建 API 来绕过保留域保护。

**影响**

低。绕过需要故意手动操作文件系统。

**计划修复方案**

待定 —— 可能会在扫描器或注册表层增加强制过滤。

## 2. User 覆盖 Builtin 命令的实现存在缺陷（同名冲突导致启动崩溃）

**描述**

CLI.md 声明 "User 与 Builtin 的冲突以 User 为准"，但 `src/cli/domains.ts` 在启动时会将 `listAllCommands()` 返回的所有命令（user 在前、builtin 在后）直接注册到同一个 domain 下。当用户自定义命令与 builtin 命令同名时，Commander.js 会检测到重复子命令并直接抛错，导致 CLI 启动即崩溃，根本无法完成覆盖。

**影响**

高。用户无法安全地覆盖同名 builtin 命令。

**计划修复方案**

在注册前对 user 和 builtin 命令进行去重，确保同一 domain/action 只注册优先级更高的 user 命令。

## 3. 日志写入在 `~/.websculpt` 未初始化时会抛出未捕获异常

**描述**

`appendLog`（`src/infra/store.ts`）在写入 `~/.websculpt/log.jsonl` 时，若父目录不存在（即用户未执行 `config init`），`writeFile(..., { flag: "a" })` 会抛出 `ENOENT` 异常。这导致用户跳过 `config init` 直接运行扩展命令时，命令本身的业务结果虽已打印到 stdout，但后续日志写入会使进程以退出码 1 崩溃。

**影响**

中。隐式依赖前置初始化步骤，且未在文档中明确说明。

**计划修复方案**

在 `appendLog` 中自动创建父目录（`mkdir(..., { recursive: true })`），或在命令执行前做更完善的环境校验与容错提示。

## 4. `command show` 的功能定位已确定，待实现

**描述**

`command show <domain> <action>` 目前为占位实现（返回 `NOT_IMPLEMENTED`）。经过讨论，其功能边界已明确：

- 与 `command list` 的差异化：`list` 是批量目录，回答"有哪些命令"；`show` 是单条契约卡片，回答"这个命令在系统中的完整档案是什么"。
- 与扩展命令自身 `--help` 的互补性：`--help`（如未来实现）面向人类调用者，回答"怎么用"；`show` 面向 AI 和框架，回答"契约签名、来源、维护资产是否完整"。
- `show` 是沉淀资产的"观测面"，服务于"探索 → 沉淀 → 自愈"闭环：AI 调用前确认参数契约，修复时判断 context.md 是否存在。

**影响**

中。命令管理 CRUD 缺少 "Read" 闭环，但不阻塞当前已有功能。

**计划修复方案**

`show` 定位为**命令资产的契约卡片**，聚合框架级元信息而非命令自己实现的 `--help`。

输出结构（JSON 模式）：

```json
{
  "success": true,
  "command": {
    "id": "zhihu-articles",
    "domain": "zhihu",
    "action": "articles",
    "description": "获取知乎用户最新文章",
    "runtime": "playwright-cli",
    "source": "builtin",
    "path": "<absolute-path-to-command-dir>",
    "entryFile": "command.js",
    "parameters": [
      { "name": "author", "required": true, "description": "作者用户名" },
      { "name": "limit", "required": false, "default": "10", "description": "最大返回数" }
    ],
    "assets": {
      "manifest": true,
      "readme": true,
      "context": false,
      "entryFile": true
    }
  }
}
```

关键字段设计意图：

| 字段 | 意图 |
|------|------|
| `source` + `path` | 区分 builtin/user，修复时直接定位物理文件 |
| `runtime` + `entryFile` | 调用前确认执行环境（node vs playwright-cli） |
| `parameters` 完整对象 | 比 `list` 更详细的契约信息，含 default/required |
| `assets` 存在性 | 暴露维护资产完整性。`context: false` 意味着"坏了没上下文可参考" |

human 模式输出示例：

```
id:          zhihu-articles
domain:      zhihu
action:      articles
runtime:     playwright-cli
source:      builtin
path:        src/cli/builtin/zhihu/articles
entry:       command.js

parameters:
  author   required  -           作者用户名
  limit    optional  10          最大返回数

assets:
  manifest  yes
  readme    yes
  context   no
```

实现时直接替换 `src/cli/meta/command.ts` 中的 `handleCommandShow` 占位逻辑。

## 5. `src/cli/index.ts` 职责过重（已解决）

**描述**

`src/cli/index.ts` 曾同时承载自定义 Help 格式化、元命令注册、扩展命令动态挂载与参数绑定、错误处理与日志追加，单文件达 285 行。

**状态**

已修复（2026-04-24）。各职责已提取至独立模块：
- `WebSculptHelp` 和 `help` 路由命令 → `src/cli/help.ts`
- 元命令注册 → `src/cli/meta/index.ts`（门面）
- 扩展命令动态挂载 → `src/cli/domains.ts`
- 执行编排（计时、错误处理、日志追加） → `src/cli/engine/executor.ts`
- `src/cli/index.ts` 缩减为纯装配层（~25 行）。

## 6. `registry.ts` 在单次 CLI 生命周期内重复扫描磁盘

**描述**

`findCommand()` 和 `listAllCommands()` 各自调用 `scanCommands()`，而 `findCommand()` 为了按优先级查找，甚至会先后扫描 user 目录和 builtin 目录两次。这意味着启动时如果同时需要 `listAllCommands`（注册所有 domain）和后续的命令查找，磁盘 I/O 会被重复执行。命令数量少时无感，但随着用户命令库增长，启动延迟会线性增加。

**影响**

低-中。当前命令量极小，性能影响可忽略；但这是结构性浪费。

**计划修复方案**

在 `main()` 启动时扫描一次全部命令，将结果缓存在内存中供同一次 CLI 生命周期复用。Registry 层提供基于缓存的查询接口，而非每次都重新扫描文件系统。
