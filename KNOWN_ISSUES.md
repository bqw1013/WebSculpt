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
