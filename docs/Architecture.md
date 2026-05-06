# WebSculpt 架构详解

> 本文档面向开发者，描述 WebSculpt 的架构设计、运行时模型与目录规划。

---

## 1. 架构总览

WebSculpt 由四层组成：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent                                    │
│  (reads docs, makes decisions, writes code, invokes CLI)            │
└─────────────────────────────────────────────────────────────────────┘
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐      ┌──────────────┐      ┌──────────────┐
│ access  │      │   explore    │      │   compile    │
│  约束层  │      │  策略层       │      │  规范层       │
└─────────┘      └──────────────┘      └──────────────┘
    │                                         │
    └─────────────────────┬───────────────────┘
                          ▼
                   ┌──────────────┐
                   │     CLI      │
                   │  交互与执行层  │
                   └──────────────┘
```

| 层级 | 作用 | 消费者 |
|------|------|--------|
| access | 为每个外部工具编写 `guide.md`，约束 Agent 的使用边界 | AI |
| explore | 编写 `strategy.md`，指导多工具配合与已有命令的复用 | AI |
| compile | 编写 `contract.md`，定义命令编写规范与校验规则 | AI / CLI |
| CLI | 提供命令的注册、发现、执行和生命周期管理 | 人类用户 / AI |

以下按顺序展开每层的设计。

---

## 2. access

### 2.1 定位

access 层为每个外部工具提供 `guide.md`，明确连接方式、可用命令和风险提示，约束 Agent 在受控边界内操作。

access 层不替代工具本身，也不做路由决策或操作编排。它只提供"这个工具怎么用、有什么限制"的参考文档，具体使用决策由 explore 层和 Agent 自行判断。

### 2.2 目录结构

```
skills/websculpt/references/access/
  <tool-name>/
    guide.md             # 工具操作参考
```

英文版本位于 `skills/websculpt-en/references/access/`。

---

## 3. explore

### 3.1 定位

explore 层提供多工具配合的编排策略，指导 Agent 如何组合工具完成复杂任务。随着命令库积累，Agent 可以直接复用已有的 builtin 或 user 命令获取信息，减少重复消耗 Token。

探索结果经 compile 校验后，通过 `command create` 沉淀为新命令，形成"探索 → 沉淀 → 复用"的闭环。explore 层的产出是面向 AI 的决策参考文档（`strategy.md`），不产生可执行代码。

### 3.2 目录结构

```
skills/websculpt/references/explore/
  strategy.md          # 探索策略文档
```

英文版本位于 `skills/websculpt-en/references/explore/`。

---

## 4. compile

### 4.1 定位

compile 层定义扩展命令的编写规范。与 access、explore 不同，compile 的规范没有独立 CLI，而是通过 CLI 的 `command draft`、`command validate`、`command create` 命令落地执行。

运行时契约与编写规范见 [`skills/websculpt/references/compile/contract.md`](../skills/websculpt/references/compile/contract.md)。

### 4.2 关键设计决策

- **结构强制、逻辑自由**：manifest 格式、导出签名等元数据由系统硬性约束；命令内部的具体实现由 AI 根据探索结果自行编写。

- **校验为硬门槛**：`command create` 落盘前强制执行 L1-L3 分层校验，失败一律阻止写入。

  | 层级 | 范围 |
  |------|------|
  | L1 结构 | manifest 字段与类型 |
  | L2 合规 | 禁止使用的代码模式 |
  | L3 契约 | 代码结构与 manifest 的一致性 |

---

## 5. CLI

### 5.1 定位

CLI 是命令的发现、管理与生命周期入口，面向人类用户和 AI 提供同一套界面：

- **Meta 命令**：管理 CLI 本身和命令库，如 `command`、`config`、`skill`、`daemon`。
- **扩展命令**：可复用的信息获取工作流，分为 Builtin（项目默认）和 User（用户自定义）。User 可覆盖 Builtin，使系统可进化；Meta 不可覆盖，防止扩展命令破坏核心管理能力。

### 5.2 命令生命周期

`command draft` 与 `command create` 的设计分工基于一个原则：**草稿态允许试错，正式态强制合规**。

- `draft` 生成合规骨架，不校验、不落盘，让 Agent 专注于业务逻辑。
- `validate` 是预检闸门，只读。
- `create` 是唯一合法入口，执行 L1-L3 硬门槛校验后落盘。

---

## 6. 运行时与执行后端

WebSculpt 当前支持两种执行路径：

- **`node`**：CLI 进程直接动态导入命令模块，在同进程内完成执行。
- **`playwright-cli`**：由后台 daemon 进程执行，CLI 通过 IPC 转发任务。daemon 随首次调用自动拉起，也可通过 `daemon` 元命令手动管理。

daemon 集中管理浏览器资源，负责内存监控、执行次数阈值触发自动重启、metrics 与日志持久化。

`shell` 与 `python` 已完成命令包生命周期支持（`draft`、`validate`、`create` 均可生成和校验），但 CLI 执行引擎尚未接入。

---

## 7. 目录规划

### 7.1 项目目录

```
WebSculpt/
├── src/
│   ├── cli/                    # 入口、引擎、Meta 命令、内置命令、校验器
│   │   ├── engine/             # 命令发现与执行调度
│   │   ├── meta/               # 元命令实现与共享逻辑
│   │   ├── builtin/            # 内置扩展命令
│   │   └── runtime/            # 运行时规范化
│   ├── daemon/                 # 后台浏览器执行进程
│   │   ├── client/             # IPC 客户端、生命周期管理、状态持久化
│   │   ├── server/             # 浏览器管理与任务执行后端
│   │   └── shared/             # 协议定义与跨进程共享路径
│   ├── types/                  # 跨层共享 TypeScript 类型定义
│   └── infra/                  # 基础设施工具：用户目录路径、配置与日志读写
├── skills/websculpt/           # Agent skill 交付物
├── tests/                      # 测试套件（CLI 引擎、Meta 命令与 daemon）
└── dist/                       # 构建输出
```

### 7.2 用户目录

```
~/.websculpt/
├── commands/                # 用户自定义扩展命令
├── config.json              # 用户配置
├── log.jsonl                # 扩展命令执行日志
├── audit.jsonl              # 命令安装/覆盖审计日志
├── registry-index.json      # 持久化注册表索引（命令 manifest 缓存）
├── daemon.json              # daemon 进程状态（PID、socket 路径）
└── daemon.log               # daemon 运行日志
```
