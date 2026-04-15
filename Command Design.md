​	目标：一个可扩展的信息搜索命令行工具。包括三种命令：a. 元命令；b. 内建的搜索命令；c. 用户自己建立的搜索命令；

​	元命令目前放在`src/cli/meta`目录下，内建的搜索命令在`src/commands/builtin`，自建命令则在`~/.websculpt/commands`。

​	WebSculpt 将 CLI 能力分为两类：

- **元命令**：系统自带的"管家命令"，负责管理扩展命令库和系统本身。
- **扩展命令**：用户或 AI 创建的业务命令，以 `websculpt <domain> <action>` 的形式直接调用。

## 元命令的设计

​	`websculpt config init`：初始化用户自建命令目录；

​	`websculpt command list`：列出所有命令，并标明内置命令、用户自定义还有待确认

​	`websculpt command approve <pending-id>`：确认固化待确认命令，并移动到用户命令库

​	扩展命令不能占用元命令的保留词，否则会在 `approve` 阶段被 `Guard` 拦截。

### 查找优先级

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **用户自定义命令**（`~/.websculpt/commands/<domain>/<action>/`）
2. **内置基础命令**（`src/commands/builtin/<domain>/<action>/`）
3. **元命令**（系统内置，不可覆盖）