# WebSculpt 设计文档

---

## 1. 设计哲学

WebSculpt 的核心假设是：**AI 擅长处理不确定性，传统代码擅长固化确定性**。真正有效的系统，不是把所有事情都交给 AI 做，而是用确定性的执行层去组织 AI 的概率性能力。

由此推导出三个设计原则：

1. **认知与执行严格解耦**
   - AI（Skill 层）负责理解用户意图、选择网络通道、进行首次探索。
   - WebSculpt 核心（TS 项目）负责存储、匹配、执行已固化的确定性命令，以及管理命令的生命周期。

2. **只做补充，不做重复**
   - Agent 已经具备 WebSearch、WebFetch、curl、代码执行等通用网络能力，WebSculpt 不再内建这些。
   - WebSculpt 只解决 Agent 做不到的事：**本地持久化存储、命令复用、环境漂移后的重构、确定性快路径**。

3. **生成-缓存-自愈闭环**
   - 面对新场景时，由 Agent 动态探索（概率）。
   - 探索成功后，将操作模式沉淀为本地可执行命令（固化）。
   - 后续同类请求直接走固化命令，零模型调用。
   - 当外部环境漂移导致命令失效时，由用户反馈（或自动模式）触发 Agent 基于上下文重构命令。

4. **机器优先的输出契约**
   - WebSculpt 核心永远输出结构化数据（JSON）。
   - 呈现给人类的内容由 Skill/Agent 负责翻译，确保执行层与接口层解耦。

---

## 2. 需求

### 2.1 交互需求
- **主入口是聊天**：用户通过自然语言与 Agent/Skill 交互，无需记忆 CLI 命令。
- **CLI 是隐蔽的执行层**：CLI 命令主要暴露给 AI 调用，用户仅在必要时可直接使用。

### 2.2 网络访问需求
- **Agent 负责首次探索**：WebSculpt 不内置 curl、WebSearch 等通用网络能力。当没有匹配命令时，由 Agent 使用自身工具（WebFetch、curl、WebSearch 等）完成首次探索。
- **固化命令优先**：如果存在可复用的历史命令，WebSculpt 优先直接执行命令，跳过 AI 推理。
- **可选补充 CDP**：对于 Agent 难以处理的动态页面场景，WebSculpt 可内嵌轻量 CDP 能力作为补充（预留，不优先实现）。

### 2.3 命令体系需求
- **内置基础命令**：项目自带一套经过验证的基础命令库（如 `websculpt github repo`、`websculpt zhihu hot`），安装后即可直接使用。
- **用户可自由扩展**：Agent 探索新场景后，可将探索成果固化为新的 CLI 子命令（如 `websculpt xiaohongshu search`）。
- **命名由用户确认**：固化时生成命令草案，由用户/Agent 确认最终命名，避免冲突和歧义。
- **命令分层查找**：执行时先查用户自定义命令库，再查内置基础命令库。

### 2.4 固化与复用需求
- **半自动固化**：Agent 探索成功后，系统生成命令草案，提交给用户/Agent 确认；用户可选择"总是同意"转为全自动模式。
- **固化产物是可执行命令**：每个命令附带元数据（命名空间、描述、参数定义），被识别为 CLI 能力的扩展，而非单纯的数据规则。
- **按约束生成**：系统提供命令生成约束，AI 生成的命令实现必须通过护栏校验（安全扫描、语法检查、输出 Schema 校验）才能入库。

### 2.5 失败处理与自愈需求
- **用户反馈驱动**：命令执行异常时，优先由用户指出"结果不对"或"页面变了"，再触发重构流程。
- **可配置自动模式**：用户也可开启自动检测，当系统识别到环境漂移特征时自动唤醒 AI 修复命令。
- **不自动盲修**：没有用户确认或自动模式开启时，系统仅记录异常日志，等待后续处理。

### 2.6 扩展需求
- **定时调度预留**：架构上为未来定时任务（监控、周期性采集）留有调度器扩展位，但不作为首期实现目标。
- **纯 CLI 形态优先**：首期以 CLI 子命令暴露能力，不引入常驻 Daemon 或 MCP Server，降低启动成本。

---

## 3. 目录结构

```
WebSculpt/
├── src/
│   ├── cli/                          # 元命令的实现
│   │   ├── index.ts                  # CLI 入口：元命令注册 + 扩展命令动态注册
│   │   ├── meta/                     # 元命令子命令（一个文件一个命令）
│   │   │   ├── compile.ts            # websculpt compile --context
│   │   │   ├── command.ts            # websculpt command list/approve/test/...
│   │   │   ├── config.ts             # websculpt config init/get/set
│   │   │   ├── log.ts                # websculpt log recent/stats
│   │   │   └── doctor.ts             # websculpt doctor
│   │   └── utils/
│   │       └── output.ts             # 统一 JSON 输出格式化
│   │
│   ├── core/                         # 核心业务逻辑（能力层 + 编排层）
│   │   ├── router.ts                 # 请求路由器：查库 → 命中/未命中
│   │   ├── command-engine.ts         # 命令引擎：扫描、匹配、参数注入
│   │   ├── fetcher.ts                # 获取编排器：调用引擎 → 格式化输出
│   │   └── compiler.ts               # 编译器：生成命令草案
│   │
│   ├── runner/                       # 命令执行沙箱
│   │   ├── command-runner.ts         # 加载并执行 command.js
│   │   └── sandbox.ts                # 安全上下文：包装 fetch、console 等
│   │
│   ├── commands/                     # 扩展命令库（框架的"肌肉"）
│   │   └── builtin/                  # 内置基础命令（随项目发布）
│   │       └── example/
│   │           └── hello/
│   │               ├── manifest.json # 命令元数据
│   │               └── command.js    # 命令实现
│   │
│   ├── infra/                        # 基础设施
│   │   ├── paths.ts                  # 路径管理：~/.websculpt/ 目录结构
│   │   ├── store.ts                  # 本地存储：pending/config/logs
│   │   ├── guard.ts                  # 护栏：命名/安全/输出校验
│   │   └── schema.ts                 # manifest 等共享类型定义
│   │
│   └── types/
│       └── index.ts                  # 全局 TypeScript 类型
│
├── dist/                             # 构建产物
│   ├── cli/index.js                  # 可执行入口
│   ├── core/...                      # 编译后的核心逻辑
│   └── commands/builtin/             # 构建时从 src/commands/builtin 复制
│
├── package.json
├── tsconfig.json
├── DESIGN.md                         # 本文档
└── ROADMAP.md                        # 开发路线图
```

### 各目录职责

#### `src/cli/` — 元命令的家
这是人和 Agent 打交道的第一层。
- `index.ts` 做两件事：
  1. 注册所有**元命令**（`compile`, `command`, `config`, `log`, `doctor`...）
  2. **动态注册扩展命令**：启动时扫描 `src/commands/builtin/` 和 `~/.websculpt/commands/`，把 `example/hello` 这样的命令注册成 `websculpt example hello`
- `meta/*.ts` 是每个元命令的具体实现。保持**一个文件一个命令**的约定，方便人和 AI 快速定位修改点。

#### `src/core/` — 业务逻辑的心脏
这一层对 CLI 透明，CLI 只调这一层的函数，不直接碰文件系统或命令执行。
- `router.ts`：核心决策点。输入 `domain/action/args`，输出"命中结果"或 `suggestExplore`。
- `command-engine.ts`：负责"找命令"。按优先级扫描 `~/.websculpt/commands/`（用户自定义）→ `src/commands/builtin/`（内置基础命令）。
- `fetcher.ts`：负责"跑命令并包装结果"。调用 `command-engine` → `runner` → 返回标准 JSON。
- `compiler.ts`：接收 Agent 给的上下文字符串，生成 `manifest.json` + `command.js` 草案，写入 `~/.websculpt/pending/`。

#### `src/runner/` — 扩展命令的跑步机
专门负责"执行一段不信任的代码"。
- `command-runner.ts`：找到 `command.js`，加载并运行。
- `sandbox.ts`：构建安全上下文。只暴露安全的全局对象（包装后的 `fetch`、只读 `console` 等），屏蔽原生 `require`、`process`、`fs`。

#### `src/commands/builtin/` — 内置基础命令库
扩展命令和元命令平级存在，但住在不同的目录。
```
src/commands/builtin/
├── example/hello/              # websculpt example hello
├── zhihu/hot/                  # websculpt zhihu hot（未来）
└── github/repo/                # websculpt github repo（未来）
```
**为什么放在 `src/` 里？**
- 方便版本控制：内置命令随代码一起迭代。
- 方便人和 AI 发现：打开项目就能看到这个框架已经"会什么"。
- 构建时复制到 `dist/commands/builtin/`，确保运行时可读。

#### `src/infra/` — 基础设施
- `paths.ts`：统一管理所有本地路径。
  ```ts
  const USER_HOME = os.homedir();
  export const WEBSCULPT_DIR = path.join(USER_HOME, '.websculpt');
  export const USER_COMMANDS_DIR = path.join(WEBSCULPT_DIR, 'commands');
  export const PENDING_DIR = path.join(WEBSCULPT_DIR, 'pending');
  export const BUILTIN_COMMANDS_DIR = path.resolve(__dirname, '../../commands/builtin');
  ```
- `store.ts`：读写 `pending.json`、`config.json`、`log.jsonl`。
- `guard.ts`：所有约束的检查函数集合（命名约束、静态安全扫描、manifest 完整性校验）。
- `schema.ts`：`manifest.json` 的 TS 类型定义，方便校验和 IDE 提示。

### 人和 AI 如何扩展

**加一个元命令**：
1. 在 `src/cli/meta/` 下新建一个文件（如 `sync.ts`）
2. 在 `src/cli/index.ts` 里注册 `websculpt sync`
3. 完成。不需要碰核心层。

**加一个内置扩展命令**：
1. 新建目录 `src/commands/builtin/my-site/feature/`
2. 写 `manifest.json` + `command.js`
3. 构建后自动可用。`websculpt my-site feature` 就能跑。

> 这对 AI 特别友好：生成新命令时，只需要"在正确位置创建两个文件"，不需要理解整个项目的模块依赖。

**用户自定义命令**：
```bash
mkdir -p ~/.websculpt/commands/my-blog/latest
# 写入 manifest.json + command.js
```
然后 `websculpt my-blog latest` 立刻生效。不需要重新构建 WebSculpt。

---

## 4. 分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 5: 接口层 (Interface Layer)                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   CLI 入口: websculpt <domain> <action> [args...]                          │
│            websculpt compile --context '{...}'                             │
│            websculpt command list | approve <pending-id>                   │
│   Skill 说明书: 教 AI 如何调用 WebSculpt，以及何时用自带工具、何时固化      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 4: 编排层 (Orchestration Layer)                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                        请求路由器                            │          │
│   │  输入: {domain, action, args, context}                      │          │
│   │    │                                                        │          │
│   │    ├──▶ 查询 Command Engine: 有匹配命令? ──────▶ 快路径    │          │
│   │    │         (执行命令实现，返回 JSON)                      │          │
│   │    │ 未命中                                                │          │
│   │    └──▶ 返回 suggestExplore: true ──────────▶ 交给 Agent   │          │
│   │                                                自行探索      │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │              任务调度器 (Scheduler) - 预留扩展位             │          │
│   │         负责定时任务的注册、触发、状态追踪（未来实现）       │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 3: 能力层 (Capability Layer)                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │ Command Engine  │    │    Fetcher      │    │    Compiler     │        │
│   │    命令引擎      │    │   获取编排器     │    │    编译器       │        │
│   │                 │    │                 │    │                 │        │
│   │ • 命令注册/发现  │◄───│ • 组装请求      │    │ • 接收 Agent    │        │
│   │ • 分层查找       │    │ • 调用 Command  │    │   探索成功的    │        │
│   │   (用户优先)     │    │   Engine        │    │   上下文        │        │
│   │ • 参数注入/校验  │    │ • 结果标准化    │    │ • 提取通用模式  │        │
│   │ • 命令沙箱执行   │    │ • 错误分类      │    │ • 生成命令草案  │        │
│   │                 │    │                 │    │ • 绑定元数据    │        │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 2: 执行层 (Execution Layer)                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────────────────────────────────┐   │
│   │   Command       │    │            可选扩展                         │   │
│   │   Runner        │    │  ┌────────┐  ┌────────┐  ┌────────────┐   │   │
│   │   命令执行沙箱   │    │  │  CDP   │  │   ...  │  │    ...     │   │   │
│   │                 │    │  │ Driver │  │        │  │            │   │   │
│   │ • 加载命令实现  │    │  │(占位)  │  │        │  │            │   │   │
│   │ • 注入参数      │    │  └────────┘  └────────┘  └────────────┘   │   │
│   │ • Node.js 执行  │    │                                             │   │
│   │                 │    │  注: curl/WebSearch 等通用能力由 Agent 提供  │   │
│   └─────────────────┘    │      WebSculpt 不再重复实现                  │   │
│                          └─────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: 基础设施层 (Infrastructure Layer)                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐    │
│   │  Command Repo   │    │       Guard         │    │      Store      │    │
│   │  (命令仓库)      │    │      (护栏)         │    │    (日志/配置)   │    │
│   │                 │    │                     │    │                 │    │
│   │ 用户命令目录    │    │ • 命令语法安全扫描  │    │ • 执行日志       │    │
│   │  ~/.websculpt/  │    │ • 禁止敏感 API 清单 │    │ • 用户配置       │    │
│   │ 内置命令目录    │    │ • 输出 Schema 校验  │    │ • 命中统计       │    │
│   │  src/commands/  │    │ • 漂移标记记录      │    │ • 待确认队列     │    │
│   └─────────────────┘    └─────────────────────┘    └─────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 接口层
- **CLI 入口**：
  - `websculpt <domain> <action> [args...]`：执行具体命令（如 `websculpt github repo eze-is/web-access`）。
  - `websculpt compile --context '{...}'`：从 Agent 探索成果生成命令草案。
  - `websculpt command list`、`websculpt command approve <pending-id>`：命令管理。
- **Skill 说明书**：教 AI 如何调用 WebSculpt。重点说明：
  - 对于明确的目标，直接尝试 `websculpt <domain> <action>`（如 `websculpt zhihu hot`）。
  - 若未命中命令（返回 `suggestExplore: true`），**Agent 应使用自身工具进行探索**。
  - 探索成功后，调用 `websculpt compile` 把成果固化成新命令。

### 4.2 编排层
- **请求路由器 (Router)**：所有请求的中央调度点。
  - **快路径**：查询 `Command Engine`，命中则注入参数、执行命令、返回结果。
  - **慢路径（未命中）**：直接返回 `{ command: null, suggestExplore: true }`，由 Agent 自行探索。
- **任务调度器 (Scheduler)**：架构预留位。未来负责定时任务的注册、触发与状态追踪，首期不实现具体调度逻辑。

### 4.3 能力层
- **Fetcher（获取编排器）**：
  - 当 Router 命中命令时，组装参数，调用 `Command Engine`。
  - 将 `Command Runner` 的输出标准化为机器可读的 JSON。
  - 对错误进行分类（命令错误、参数缺失、输出异常、漂移可疑）。
- **Command Engine（命令引擎）**：
  - **分层查找**：先查用户命令目录 `~/.websculpt/commands/`，再查内置命令目录 `src/commands/builtin/`。
  - 根据 `domain + action` 命中命令，注入并校验参数，在受控沙箱中执行。
  - 维护命令元数据（`manifest.json`），包括描述、参数签名、版本信息。
- **Compiler（编译器）**：
  - 接收 Agent 探索成功后的上下文（URL、策略、选择器、结果样本等）。
  - 分析上下文，提取可复用模式，生成命令实现草案和 `manifest.json`。
  - 存入 `Store` 的待确认队列，等待用户确认命名和入库。

### 4.4 执行层
- **Command Runner（命令执行沙箱）**：加载命令实现文件，注入参数，在 Node.js 环境中执行。
- **可选扩展**：CDP Driver 等 Agent 无法提供的特殊能力。curl/WebSearch 等通用网络能力**不在这里实现**，由 Agent 自带工具提供。

### 4.5 基础设施层
- **Command Repository（命令仓库）**：
  - **用户命令**：`~/.websculpt/commands/<domain>/<action>/`，存放用户固化的自定义命令。
  - **内置命令**：`src/commands/builtin/<domain>/<action>/`，随项目发布，经过验证的基础命令。
- **Guard（护栏）**：
  - 对 `Compiler` 生成的命令进行安全扫描（禁用敏感 API、注入风险检测）。
  - 校验命令输出是否符合预期 Schema。
  - 标记漂移可疑的执行记录。
- **Store（日志与配置）**：
  - 记录每次执行的日志（成功/失败、耗时、命中命令等）。
  - 保存用户配置（如"总是同意固化"、自动漂移修复开关）。
  - 维护待确认队列（pending commands）。

---

## 5. 核心数据流

### 5.1 快路径（已固化命令）
```
用户聊天
  → Skill 尝试 websculpt zhihu hot
  → Router 查询 Command Engine
  → 命中命令（先查用户库，再查内置库）
  → Fetcher 调用 Command Runner 执行
  → 返回结构化 JSON
  → Skill 翻译并呈现给用户
```

### 5.2 慢路径（新场景探索）
```
用户聊天
  → Skill 尝试 websculpt xiaohongshu search 穿搭
  → Router 未命中命令
  → 返回 { command: null, suggestExplore: true }
  → Skill 使用 Agent 自带工具（WebFetch / curl / WebSearch）进行探索
  → Agent 拿到探索结果
  → Skill 判断是否值得固化
     → 值得固化
       → Skill 调用 websculpt compile --context '{...}'
       → Compiler 生成命令草案 + manifest（建议命名空间为 xiaohongshu/search）
       → Guard 安全扫描
       → 存入 Store 待确认队列
       → Skill 询问用户:"是否固化为 xiaohongshu search 命令?"
          → 用户同意（或已设置"总是同意"）→ 移入 ~/.websculpt/commands/
          → 用户拒绝 / 重命名 → 保留日志，不入库
     → 不值得固化
       → 直接返回探索结果给用户，不调用 compile
```

### 5.3 漂移与自愈
```
用户聊天
  → Skill 调用 websculpt zhihu hot
  → Router 命中旧命令
  → Fetcher 调用 Command Runner 执行
  → 命令异常 或 输出不符合预期
  → Guard 标记"漂移可疑"并记录日志
  → 返回 JSON 中包含 driftSuspected: true
  → Skill 收到后：
     若用户开启自动模式: 直接唤醒 AI，用旧命令 + 错误上下文生成新版本
     若未开启自动模式: 提示用户:"zhihu hot 命令近期异常，是否需要修复?"
  → 用户确认修复
  → AI 生成新命令实现
  → 重新走 Guard 校验和确认流程（或直接替换，若开启总是同意）
```

---

## 6. 关键决策

| 决策点 | 当前选择 |
|--------|----------|
| 核心形态 | **CLI 命令扩展框架**，而非网络请求代理 |
| 固化模式 | **半自动**，用户可配置"总是同意"转为全自动 |
| 固化产物 | **可执行命令 + manifest 元数据**，存入文件系统仓库 |
| 命令查找 | **分层查找**：用户自定义命令优先，内置基础命令兜底 |
| 命令命名 | **固化时由用户/Agent 确认**，避免冲突 |
| 通用网络能力 | **由 Agent 自带工具提供**，WebSculpt 不重复实现 curl/WebSearch |
| WebSculpt 的网络角色 | **查库匹配 + 命令执行**，未命中时返回 `suggestExplore: true` |
| 漂移触发 | **用户反馈优先**，可开启自动检测模式 |
| 系统形态 | **纯 CLI**，未来可扩展为 Daemon/MCP |
| 输出格式 | **机器结构化 JSON**，由 Skill 负责翻译给用户 |
| 定时调度 | 架构预留，不优先实现 |

---

## 7. CLI 设计

### 7.1 元命令（Meta Commands）

元命令是 WebSculpt 自带的系统命令，用于管理扩展命令库和系统本身。扩展命令**禁止占用**元命令的命名空间。

#### 核心交互命令

| 命令 | 功能 | 使用频率 |
|------|------|----------|
| `websculpt compile --context '{...}'` | 接收 Agent 探索成功的上下文，生成命令草案并放入待确认队列 | 高 |

#### 命令管理命令

| 命令 | 功能 | 使用频率 |
|------|------|----------|
| `websculpt command list` | 列出所有命令（内置 / 用户自定义 / 待确认），标注来源和状态 | 中 |
| `websculpt command show <domain> <action>` | 查看命令的 manifest 和实现代码 | 低 |
| `websculpt command approve <pending-id>` | 确认固化待确认命令，通过 Guard 后移入用户命令库 | 高 |
| `websculpt command reject <pending-id>` | 拒绝并删除待确认命令 | 低 |
| `websculpt command rename <domain> <action> <new-domain> <new-action>` | 重命名用户自定义命令 | 低 |
| `websculpt command remove <domain> <action>` | 删除用户自定义命令（内置命令不可删除） | 低 |
| `websculpt command test <domain> <action> [args...]` | 在沙箱中测试运行某个命令，不记录日志 | 中 |

#### 配置与诊断命令

| 命令 | 功能 | 使用频率 |
|------|------|----------|
| `websculpt config init` | 初始化 `~/.websculpt/` 目录结构 | 一次性 |
| `websculpt config get <key>` | 读取配置项（如 `always-approve`） | 低 |
| `websculpt config set <key> <value>` | 设置配置项 | 低 |
| `websculpt log recent [--limit=10]` | 查看最近执行记录 | 低 |
| `websculpt log stats` | 查看命令命中率、失败率统计 | 低 |
| `websculpt doctor` | 环境诊断：目录是否存在、权限是否正常、命令库是否损坏 | 低 |

#### 首期实现范围

首期（MVP 阶段）必须实现的元命令：
- `compile`
- `command list`
- `command approve`
- `config init`

其余命令可以延后实现。

### 7.2 扩展命令（Extended Commands）

扩展命令是通过 `compile` 生成的用户命令，或随项目发布的内置命令。它们以 `websculpt <domain> <action>` 的形式被调用。

扩展命令必须遵守以下三类约束：

#### 约束一：命名约束

扩展命令不能和元命令冲突，且必须符合格式规范。

| 规则 | 说明 |
|------|------|
| **禁止占用保留词** | `compile`, `command`, `config`, `log`, `doctor`, `help`, `version` 不可作为 `domain` |
| **格式规范** | `domain` 和 `action` 只能包含小写字母、数字和连字符（`[a-z0-9-]+`） |
| **长度限制** | `domain` ≤ 20 字符，`action` ≤ 30 字符 |
| **层级限制** | 只能是 `websculpt <domain> <action>`，不支持第三级子命令 |

> **Guard 实现**：`compile` 和 `approve` 时调用 `validateCommandName(domain, action)` 进行校验。

#### 约束二：行为约束（安全边界）

扩展命令本质上是在本地执行 Node.js 代码，必须对其行为进行严格限制。

| 规则 | 说明 | Guard 实现 |
|------|------|------------|
| **禁止子进程** | 不得调用 `child_process.exec`, `spawn`, `fork` | 静态扫描 `command.js` 中的危险 `require` 模式 |
| **禁止文件系统写入** | 不得调用 `fs.writeFile`, `fs.mkdir`, `fs.unlink` 等写入操作 | 静态扫描危险 API；运行时只暴露只读沙箱 |
| **禁止环境变量读取** | 不得读取 `process.env` | 静态扫描 `process.env`；运行时屏蔽 `process` 对象 |
| **禁止动态代码执行** | 不得使用 `eval()`, `Function()`, `new Function()` | 静态扫描 `eval` / `Function` 关键字 |
| **网络请求白名单**（可选） | 严格模式下，命令只能访问 `manifest.allowedHosts` 中声明的域名 | `CommandRunner` 提供包装后的 `fetch`，做域名拦截 |
| **执行超时** | 每个命令最多执行 30 秒，超时被强制终止 | `CommandRunner` 使用 `Promise.race([command(), timeout()])` |
| **内存限制** | 最多使用 128MB 内存（预留，首期可用超时兜底） | 运行期监控（未来实现） |

> **首期实现**：采用"**静态扫描 + 运行时上下文拦截**"的轻量方案。`CommandRunner` 为命令提供受控上下文，只注入安全的全局对象（如包装后的 `fetch`、只读日志 `console`），不暴露原生的 `require`、`process`、`fs`。

#### 约束三：输出约束

扩展命令的输出必须能被 Skill/Agent 稳定消费。

| 规则 | 说明 | Guard 实现 |
|------|------|------------|
| **返回 JSON 可序列化对象** | 命令函数必须 `return` 一个普通对象 | `CommandRunner` 执行后做 `typeof result === 'object'` 校验 |
| **声明输出 Schema** | `manifest.json` 中必须包含 `outputSchema` 字段，描述返回对象的关键字段 | `compile` 和 `approve` 时校验 manifest 完整性 |
| **错误统一格式** | 命令内部报错时，建议抛出包含 `code` 和 `message` 的错误对象 | `Fetcher` 层统一捕获并包装为标准错误 JSON |

标准返回格式由 `Fetcher` 层统一包装：
```json
{
  "success": true,
  "command": "zhihu/hot",
  "data": { "items": [...] },
  "meta": { "duration": 1200 }
}
```

### 7.3 命令查找优先级

当用户输入 `websculpt <domain> <action>` 时，系统按以下优先级查找：

1. **用户自定义命令**（`~/.websculpt/commands/<domain>/<action>/`）
2. **内置基础命令**（`src/commands/builtin/<domain>/<action>/`）
3. **元命令**（系统内置，不可覆盖）

如果三步都未命中，则返回：
```json
{
  "success": true,
  "command": null,
  "suggestExplore": true
}
```

> **重要**：扩展命令**绝对不能覆盖元命令**。如果 `compile` 生成的命令草案使用了保留词作为 `domain`，`Guard` 必须在 `approve` 阶段拦截并拒绝。

---
