# WebSculpt 元命令设计

本文档记录 WebSculpt 元命令（Meta Commands）的设计原则、当前清单和命名空间规则。

---

## 1. 设计原则

### 1.1 元命令与扩展命令严格分离

WebSculpt 将 CLI 能力分为两类：

- **元命令**：系统自带的"管家命令"，负责管理扩展命令库和系统本身。
- **扩展命令**：用户或 AI 创建的业务命令，以 `websculpt <domain> <action>` 的形式直接调用。

元命令的代码实现统一放在 `src/cli/meta/` 目录下，遵循"一个文件一个命令"的约定。

### 1.2 扩展命令直接调用，不需要 `run` 抽象

扩展命令通过 `websculpt <domain> <action>` 直接调用即可，不需要额外的 `run` 元命令作为中介。CLI 启动时会动态扫描命令库，将所有扩展命令注册为 `commander` 的一级子命令。

**为什么删除 `run`？**
- `websculpt zhihu hot` 对用户和 Agent 都比 `websculpt run zhihu hot` 更自然。
- `run` 与直接调用功能重复，增加了不必要的认知负担。
- Agent 完全有能力学会直接调用的语法。

### 1.3 不内建 `probe` 机制

WebSculpt 不再提供 `websculpt probe <url>` 命令。

**为什么删除 `probe`？**
- 当前 `probe` 的实现过于简单（仅基于字符串包含做 host → domain 的模糊匹配），不足以提供比 Agent 自身判断更可靠的结果。
- Agent 可以直接调用 `websculpt command list` 获取所有命令的元数据，然后自行判断某个 URL 应该命中哪个命令。
- 如果未来需要精准的 URL → 命令路由，应该在更高层（如 Agent 的 Skill 层或 WebSculpt 的 host 映射表）解决，而不是通过 CLI 元命令暴露一个半吊子的探测接口。

---

## 2. 元命令清单

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `websculpt compile --context <json>` | 接收 Agent 探索成功的上下文，生成命令草案并放入待确认队列 | Agent 首次探索成功后，将成果固化为可复用命令 |
| `websculpt command list` | 列出所有命令（内置 / 用户自定义 / 待确认） | Agent 或用户查看当前可用能力 |
| `websculpt command approve <pending-id>` | 确认固化待确认命令，移入用户命令库 | 完成"生成-缓存"闭环的最后一步 |
| `websculpt config init` | 初始化 `~/.websculpt/` 目录结构 | 首次安装或环境重置时使用 |

**预留但未实现的元命令**（未来按需添加）：
- `websculpt command show <domain> <action>`
- `websculpt command remove <domain> <action>`
- `websculpt config get <key>` / `websculpt config set <key> <value>`
- `websculpt log recent` / `websculpt log stats`
- `websculpt doctor`

---

## 3. 命名空间规则

扩展命令不能占用元命令的保留词，否则会在 `approve` 阶段被 `Guard` 拦截。

### 当前保留词

以下词汇不可作为扩展命令的 `domain`：

```
compile, command, config, log, doctor, help, version
```

### 查找优先级

当输入 `websculpt <domain> <action>` 时，系统按以下优先级解析：

1. **用户自定义命令**（`~/.websculpt/commands/<domain>/<action>/`）
2. **内置基础命令**（`src/commands/builtin/<domain>/<action>/`）
3. **元命令**（系统内置，不可覆盖）

如果三步都未命中，返回：

```json
{
  "success": true,
  "command": null,
  "suggestExplore": true
}
```

---

## 4. 目录结构

```
src/cli/
├── index.ts              # CLI 入口：注册元命令 + 动态注册扩展命令
├── meta/                 # 元命令实现
│   ├── compile.ts        # websculpt compile
│   ├── command.ts        # websculpt command list / approve
│   ├── config.ts         # websculpt config init
│   ├── log.ts            # （预留）
│   └── doctor.ts         # （预留）
└── utils/
    └── output.ts         # 统一 JSON 输出格式化
```

---

## 5. 变更记录

| 时间 | 变更 | 原因 |
|------|------|------|
| 2026-04-15 | 删除 `run` 元命令 | 扩展命令直接调用更自然，Agent 不需要 `run` 抽象 |
| 2026-04-15 | 删除 `probe` 元命令 | 当前实现太弱，不如让 Agent 直接读 `command list` 做判断 |
| 2026-04-15 | 启用 `src/cli/meta/` 目录 | 让代码结构与 DESIGN.md 的规划对齐 |
