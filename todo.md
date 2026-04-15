# WebSculpt 重构计划

## 1. CLI 模块目录收拢（已完成）

将当前分散在 `src/cli`、`src/core`、`src/runner`、`src/infra` 中的命令行相关代码，收拢为一个自包含的 CLI 模块，以明确 CLI 作为独立入口适配器的边界，避免与后续 Harness 核心能力混淆。

### 目标结构

```
src/
  cli/                          # 命令行工具模块（可保留 cli，或后续重命名为 cmd/cli-tool）
    index.ts                    # CLI 入口（commander 注册与路由）
    output.ts                   # 输出格式化（原 cli/utils/output.ts）
    meta/                       # 元命令
      command.ts                # command list / approve 的 handler（变薄，仅调用核心服务）
      compile.ts                # compile 的 handler（变薄，仅调用核心服务）
      config.ts                 # config init 的 handler（变薄，仅调用核心服务）
    builtin/                    # 内置扩展命令
      example/hello/            # 原 commands/builtin 内容迁移至此
    engine/                     # CLI 内部的命令发现与执行机制
      registry.ts               # 命令扫描、查找、聚合（原 core/command-engine.ts）
      command-runner.ts         # 命令加载与运行（原 runner/command-runner.ts）
      paths.ts                  # CLI 相关的路径定义（从 infra 中拆分）
```

### 关键调整

1. **`src/cli/` 收拢命令行全部实现**
   - 将 `src/core/command-engine.ts` 迁移至 `src/cli/engine/registry.ts`。
   - 将 `src/runner/command-runner.ts` 迁移至 `src/cli/engine/command-runner.ts`。
   - 将 `src/commands/builtin/` 迁移至 `src/cli/builtin/`。

2. **`src/cli/meta/` 变薄**
   - `meta/` 下的 handler 仅负责参数解析和输出渲染。
   - 领域逻辑（如生成 manifest、审批 pending 命令、目录初始化）下沉到 `src/cli/engine/` 或后续独立的 Harness 服务中。

3. **`src/infra` 拆分**
   - 与 CLI 强相关的路径定义（`getBuiltinCommandsDir`、`USER_COMMANDS_DIR` 等）迁移到 `src/cli/engine/paths.ts`。
   - 通用基础设施（如 `store.ts` 中的日志、配置读写）保留在 `src/infra/`，供 CLI 和后续 Harness 共用。

4. **更新构建脚本与引用**
   - 调整 `package.json` 中的 `copy:commands` 脚本路径（`src/cli/builtin` -> `dist/cli/builtin`）。
   - 更新 `tsconfig.json` 如有必要。
   - 修复所有内部 import 路径。

### 预期收益

- CLI 模块自包含，后续可作为独立入口适配器演进。
- 为 Harness 核心（探索、固化、自愈、Web API）留出清晰的扩展空间，避免与 CLI 实现耦合。
# WebSculpt 重构计划

## 1. CLI 模块目录收拢

将当前分散在 `src/cli`、`src/core`、`src/runner`、`src/infra` 中的命令行相关代码，收拢为一个自包含的 CLI 模块，以明确 CLI 作为独立入口适配器的边界，避免与后续 Harness 核心能力混淆。

### 目标结构

```
src/
  cli/                          # 命令行工具模块（可保留 cli，或后续重命名为 cmd/cli-tool）
    index.ts                    # CLI 入口（commander 注册与路由）
    output.ts                   # 输出格式化（原 cli/utils/output.ts）
    meta/                       # 元命令
      command.ts                # command list / approve 的 handler（变薄，仅调用核心服务）
      compile.ts                # compile 的 handler（变薄，仅调用核心服务）
      config.ts                 # config init 的 handler（变薄，仅调用核心服务）
    builtin/                    # 内置扩展命令
      example/hello/            # 原 commands/builtin 内容迁移至此
    engine/                     # CLI 内部的命令发现与执行机制
      registry.ts               # 命令扫描、查找、聚合（原 core/command-engine.ts）
      command-runner.ts         # 命令加载与运行（原 runner/command-runner.ts）
      paths.ts                  # CLI 相关的路径定义（从 infra 中拆分）
```

### 关键调整

1. **`src/cli/` 收拢命令行全部实现**
   - 将 `src/core/command-engine.ts` 迁移至 `src/cli/engine/command-engine.ts`。
   - 将 `src/runner/command-runner.ts` 迁移至 `src/cli/engine/command-runner.ts`。
   - 将 `src/commands/builtin/` 迁移至 `src/cli/builtin/`。

2. **`src/cli/meta/` 变薄**
   - `meta/` 下的 handler 仅负责参数解析和输出渲染。
   - 领域逻辑（如生成 manifest、审批 pending 命令、目录初始化）下沉到 `src/cli/engine/` 或后续独立的 Harness 服务中。

3. **`src/infra` 拆分**
   - 与 CLI 强相关的路径定义（`getBuiltinCommandsDir`、`USER_COMMANDS_DIR` 等）迁移到 `src/cli/engine/paths.ts`。
   - 通用基础设施（如 `store.ts` 中的日志、配置读写）保留在 `src/infra/`，供 CLI 和后续 Harness 共用。

4. **更新构建脚本与引用**
   - 调整 `package.json` 中的 `copy:commands` 脚本路径（`src/cli/builtin` -> `dist/cli/builtin`）。
   - 更新 `tsconfig.json` 如有必要。
   - 修复所有内部 import 路径。

### 预期收益

- CLI 模块自包含，后续可作为独立入口适配器演进。
- 为 Harness 核心（探索、固化、自愈、Web API）留出清晰的扩展空间，避免与 CLI 实现耦合。

## 2. 元命令调整（已完成）

基于当前实现和设计方向，对元命令进行精简和重新规划。

### 保留的元命令

- **`websculpt config init`** — 初始化用户目录（`~/.websculpt`）。
- **`websculpt command list`** — 列出所有命令（builtin / user）。

### 删除的元命令

- ~~`websculpt command approve <pending-id>`~~ — 已删除源码及 CLI 注册。
- ~~`websculpt compile --context <json>`~~ — 已删除源码及 CLI 注册。

### 预留接口（暂不实现）

- **`websculpt command show <domain> <action>`** — 已在 `meta/command.ts` 中预留 `handleCommandShow`，CLI 已注册命令，当前返回占位提示。
- **`websculpt command remove <domain> <action>`** — 已在 `meta/command.ts` 中预留 `handleCommandRemove`，CLI 已注册命令，当前返回占位提示。

### 暂不考虑

其余如 `reject`、`log`、`test`、`edit`、`heal` 等元命令本次不做设计和实现，待 CLI 和 Harness 核心稳定后按需补充。
