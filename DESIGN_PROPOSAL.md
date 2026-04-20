# WebSculpt 三层架构提案（v2）

## 1. 为什么要分三层

DESIGN.md 写道：

> 代码负责边界、约束、状态、执行与审计。AI 负责理解、归纳、补全、判断与翻译。

三层架构正是为了贯彻这一分工：

- **access** — 代码确保工具就绪，并提供统一的环境状态查询接口。AI 直接操作工具。
- **explore** — 策略文档层。整合 access 层各工具的使用建议，为 AI 提供综合探索策略、工具选择倾向和启发式规则。
- **compile** — 规范与校验层。定义命令资产的编写规范与质量标准，并通过程序化校验确保 AI 产出的命令符合契约。

## 2. access — 基础设施就绪层

### 职责

为每个网络访问工具提供操作参考文档，并在未来为上层的命令执行提供统一的环境就绪查询接口。**不要**将 agent 的能力封装成新的 API。

### access 做什么

- 为每个工具提供操作参考文档（放在各自的子目录中）
- 提供统一的环境就绪状态查询接口，供上层的命令执行器判断依赖是否满足

### access 不做什么

- 不预定义操作 API（如 `browser.click()`）
- 不做路由决策（"这个任务应该用哪个工具"）
- 不编排操作序列

### 统一状态接口（规范）

所有 access 工具子目录应通过 `index.ts` 导出统一的状态查询入口：

```ts
export interface ToolStatus {
  ready: boolean;
  reason?: string;  // 未就绪时的原因说明
}

export async function getStatus(): Promise<ToolStatus>;
```

上层的 `command-runner` 在执行依赖特定环境的命令前（如 `playwright-cli` runtime），可通过该接口判断环境是否就绪，并将未就绪的原因转化为结构化错误返回给 AI。

### 目录结构

当前实际状态：

```
src/access/
  playwright-cli/
    guide.md             # 操作参考文档
```

按规范，每个工具子目录未来应补充：

```
src/access/<工具名>/
  README.md            # 连接地址与操作参考
  index.ts             # 对外入口：导出 getStatus() 等状态查询函数
  ...                  # 工具特定实现文件
```

### 当前落地状态

`src/access/playwright-cli/guide.md` 是目前唯一存在的文件。它提供了 Playwright CLI 的完整操作参考，包括连接步骤、探索策略和命令速查表。

程序化的状态查询接口（`index.ts`、`status.ts`）尚未实现，`command-runner` 目前直接调用 `npx playwright-cli run-code` 执行命令，未通过 access 层查询环境就绪状态。

### 新增工具的规范

在 `src/access/<工具名>/` 下创建子目录，必须包含：

1. `guide.md`（或同语义的操作参考文档）— 连接地址与操作参考
2. `index.ts` — 对外入口，导出 `getStatus()` 等状态查询函数

然后在 `src/access/` 的总览文档（如 `guide.md` 或 `README.md`）的可用工具表格中注册。

## 3. explore — 探索策略层

### 职责

为 AI 提供综合探索策略、工具选择倾向和启发式规则，帮助 AI 在面对陌生场景时做出合理的工具选择和操作决策。**不要**将操作序列硬编码为代码。

### 核心特征

explore 层不是代码层，不产生机器可消费的结构化日志。它的产出是**AI 的决策依据**：

1. **可用工具清单** — 来自 access 层
2. **工具选择策略** — 何时用 fetch，何时启用浏览器自动化，何时调用 API
3. **操作优先级** — 先结构后交互、先轻后重等启发式规则

### 启发式策略（可被覆盖）

- 先轻后重：优先尝试 fetch，遇反爬或需交互再启用浏览器自动化
- 一手信息优先：搜索引擎定位来源后，直接访问原始页面核实
- 先结构后交互：进入页面后先用 `/eval` 探测 DOM，再决定是否需要 GUI 点击

这些是**参考资料**，不是代码强制执行的规则。AI 在具体场景中可覆盖它们。

### 目录结构

```
src/explore/
  README.md          # 综合探索策略：工具选择倾向、启发式规则、决策优先级
```

explore 不产出结构化日志，也不管理会话生命周期。

## 4. compile — 规范与校验层

### 职责

定义 WebSculpt 命令资产的编写规范，并通过校验器确保 AI 产出的命令在结构、合规性和契约上符合标准。

### compile 做什么

- 提供面向 AI 的命令编写规范文档（`README.md`）
- 为 `command create` 提供 L1-L3 校验逻辑（结构、合规、契约）
- 定义各 runtime 的代码签名和禁止事项

### compile 不做什么

- **不自动生成命令代码** — 代码由 AI 根据探索结果自行编写
- **不直接操作文件系统落盘** — 落盘由 `command create` 负责
- **不执行命令测试** — 测试由 AI 自行调用命令完成

### 校验分层

`compile/validator.ts` 将校验分为三层，全部在 `command create` 落盘前执行：

**L1 — 结构校验（Structure）**

- `manifest` 必填字段（`id`、`domain`、`action`）
- `id` 格式应为 `${domain}-${action}`
- `runtime` 必须是合法枚举值
- `parameters` 格式正确，`name` 唯一

**L2 — 合规校验（Compliance）**

- 代码中不得出现临时 snapshot ref（如 `e15`）
- 代码中不得包含 CDP 连接/启动逻辑
- 代码中不得出现 `await import(...)` 动态导入

**L3 — 契约校验（Contract）**

- `node` runtime：代码必须是合法 ESM 模块，有 `export default` 且导出函数
- `playwright-cli` runtime：代码必须包含 `/* PARAMS_INJECT */` 占位符，语法可解析
- 代码引用的参数应在 `manifest.parameters` 中声明（严格度待确定）

### 目录结构

```
src/compile/
  README.md          # AI 规范文档：各 runtime 契约、强制规则、编写建议、自测流程
  validator.ts       # L1-L3 校验逻辑，被 command create 调用
  contract.ts        # 运行时契约常量与类型定义（可选）
```

### 与 command create 的关系

compile 不暴露独立 CLI。AI 编写完命令草稿后，通过 `command create --from-file draft.json` 提交。`command create` 内部调用 `compile/validator.ts` 进行校验。校验失败返回结构化错误列表，AI 修复后重新提交；校验通过后落盘到 `~/.websculpt/commands/`。

## 5. commands — 确定性资产

### 职责

AI 根据 explore 策略和 access 工具探索后编写的确定性命令资产，经 compile 校验后由 `command create` 落盘。与 explore 策略中的概率性知识形成镜像。

### 位置

```
WebSculpt/
  commands/                  # 内置命令（随项目分发）
    example/
      hello/
        manifest.json
        command.js
```

用户本地镜像：

```
~/.websculpt/
  commands/                  # 用户自定义命令（覆盖 / 扩展内置）
```

### 与 explore 的关系

| 层级     | 内容类型         | 格式           | 消费者 |
|----------|------------------|----------------|--------|
| explore  | 概率性策略       | Markdown（自然语言） | AI     |
| commands | 确定性逻辑       | 代码 + manifest | 机器   |

### 自愈闭环

```
命令失效
  -> 带着 explore 策略进行重新探索（AI 自主探索）
  -> AI 修复代码逻辑
  -> 经 compile 校验后通过 command create 重新落盘
```

## 6. 完整目录规划

```
WebSculpt/
├── src/
│   ├── access/              # 基础设施就绪与环境状态查询
│   │   └── playwright-cli/  # Playwright CLI 接入（接口待实现）
│   ├── explore/             # 探索策略与指南
│   ├── compile/             # 命令规范与校验
│   └── cli/                 # CLI 入口与路由
├── skills/                  # Agent skill 交付物
│   └── websculpt/
│       ├── SKILL.md
│       ├── references/
│       └── assets/
├── commands/                # 内置扩展命令
├── tests/
├── openspec/
└── dist/
```

用户主目录：

```
~/.websculpt/
├── commands/                # 用户扩展命令
├── logs/                    # 长期运行的基础设施日志
├── config.json
└── log.jsonl
```

## 7. 待确定问题

### compile 与 command create

- L3 参数一致性检查的范围：
  - 严格：代码中每个变量都必须在 `manifest.parameters` 中声明
  - 宽松：只检查 `params.xxx` 形式的访问
  - 跳过：完全信任 AI

- 校验失败是否允许强制落盘：
  - `command create` 已有 `--force` 覆盖已存在命令
  - 是否需要 `--skip-validation` 供调试使用，还是校验为绝对硬门槛？

### access 与命令执行

- `playwright-cli` 环境未就绪时的检测策略：
  - 预检：执行命令前调用 `getStatus()` 探测（可靠但有额外开销）
  - 后判：执行失败后根据错误关键词启发式判断（轻量但可能误判）
  - 透传：不做特殊处理，让原始错误直接返回给 AI

- `playwright-cli` 的 `getStatus()` 具体实现：
  - 检查 Chrome 远程调试端口是否可连接？
  - 检查 playwright-cli 是否已有活跃 attach 会话？
  - 还是检查 `playwright-cli` 二进制是否存在于 PATH？

### 类型与规范

- `CommandManifest.outputSchema` 是否启用？
  - 启用：要求 AI 编写命令时声明输出 schema，可用于运行时校验
  - 暂不启用：保留字段，不强制

- L2 合规检查项的扩充：
  - 是否增加 `eval()` 调用检查？
  - 是否增加其他代码安全/风格规则？
