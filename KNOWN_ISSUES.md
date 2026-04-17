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

## 2. 元命令缺少 `--format` / `-f` 支持

**状态：已修复**

CLI 已添加全局顶层选项 `-f, --format <human|json>`（默认 `human`）。所有元命令处理函数现在返回规范化的结果对象，由 `src/cli/output.ts` 中的 `renderOutput` 统一渲染。扩展命令行为保持不变（始终输出 JSON）。

## 3. User 覆盖 Builtin 命令的实现存在缺陷（同名冲突导致启动崩溃）

**描述**

CLI.md 声明 "User 与 Builtin 的冲突以 User 为准"，但 `src/cli/index.ts` 在启动时会将 `listAllCommands()` 返回的所有命令（user 在前、builtin 在后）直接注册到同一个 domain 下。当用户自定义命令与 builtin 命令同名时，Commander.js 会检测到重复子命令并直接抛错，导致 CLI 启动即崩溃，根本无法完成覆盖。

**影响**

高。用户无法安全地覆盖同名 builtin 命令。

**计划修复方案**

在注册前对 user 和 builtin 命令进行去重，确保同一 domain/action 只注册优先级更高的 user 命令。

## 4. 部分元命令的输出格式与设计文档不一致

**状态：已修复**

通过 `renderOutput` 统一输出层后，`handleCommandCreate`、`handleCommandRemove`、`handleCommandList`、`handleCommandShow` 和 `handleConfigInit` 均不再直接调用 `printJson` 或 `console.log`。默认 `human` 模式下输出简洁的文本提示，`json` 模式下输出结构化 JSON，风格已统一。

## 5. 日志写入在 `~/.websculpt` 未初始化时会抛出未捕获异常

**描述**

`appendLog`（`src/infra/store.ts`）在写入 `~/.websculpt/log.jsonl` 时，若父目录不存在（即用户未执行 `config init`），`writeFile(..., { flag: "a" })` 会抛出 `ENOENT` 异常。这导致用户跳过 `config init` 直接运行扩展命令时，命令本身的业务结果虽已打印到 stdout，但后续日志写入会使进程以退出码 1 崩溃。

**影响**

中。隐式依赖前置初始化步骤，且未在文档中明确说明。

**计划修复方案**

在 `appendLog` 中自动创建父目录（`mkdir(..., { recursive: true })`），或在命令执行前做更完善的环境校验与容错提示。

## 6. `command show` 的功能定位尚未明确

**描述**

`command show <domain> <action>` 目前为占位实现（返回 `NOT_IMPLEMENTED`）。其根本问题在于功能边界不清晰：

- 与 `command list` 的差异化不足。`list` 已提供命令目录级信息（domain、action、description、source），若 `show` 仅展示 `manifest.json` 原文，则只是"单个 vs 全部"的区别，价值有限。
- 与扩展命令自身 `--help` 的互补性未定。扩展命令的 `--help` 由命令自己实现，面向调用者；`show` 作为元命令，若也面向"怎么用"，则存在重叠。
- 更深层的矛盾在于：`show` 是固化资产的"观测面"，但 DESIGN.md 中"探索 → 固化 → 自愈"的闭环尚未真正跑通。固化流程到底沉淀什么文件（manifest、README、context、源码？）、参数与 schema 的声明规范、context.md 的编写标准——这些未定，导致 `show` 不知道该展示什么、展示多深。

**影响**

中。命令管理 CRUD 缺少 "Read" 闭环，但不阻塞当前已有功能。

**计划修复方案**

暂不实现，保持占位状态。待通过真实场景跑通至少一次"探索 → 固化"闭环后，根据实际信息缺口（AI 调用前需要什么、修复时需要哪些上下文）再确定 `show` 的输出结构和字段取舍。届时可能的方向：作为命令资产的"契约卡片"，聚合 manifest 签名、来源路径、关联文件存在性等框架级元信息，而非命令自己实现的 `--help`。
