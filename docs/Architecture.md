# WebSculpt 架构详解

> 本文档面向开发者和 Agent，回答"系统如何组织、各层职责边界、如何交互、代码在哪里"。是 [Design.md](Design.md) 的技术展开。

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

| 层级 | 本质 | 消费者 |
|------|------|--------|
| access | 工具的封装与行为约束 | AI / CLI runner |
| explore | 多工具配合的探索策略 | AI |
| compile | 命令资产的编写规范与校验 | AI（规范）/ CLI（校验器） |
| CLI | 经验沉淀框架的交互界面 | 人类用户 / AI |

---

## 2. access — 工具封装与约束层

### 2.1 定位

access 层不仅确保工具就绪，更要**约束 Agent 使用工具的行为**。Playwright CLI 等功能强大的工具，如果让 Agent 直接调用其全部底层 API，行为难以预测。access 层通过为每个工具提供 `guide.md`，明确连接方式、可用命令、风险提示，使 Agent 在受控边界内操作。

access 层明确不进入以下领域：

- 不预定义操作 API（如 `browser.click()`）——除非场景需要代码层约束
- 不做路由决策（"这个任务应该用哪个工具"）
- 不编排操作序列

### 2.2 目录结构

当前实际状态：

```
skills/websculpt/references/access/
  playwright-cli/
    guide.md             # Playwright CLI 操作参考
```

英文版本位于 `skills/websculpt-en/references/access/`。

每个工具子目录的最低要求：

```
skills/websculpt/references/access/<tool-name>/
  guide.md             # 必需：连接方式、可用命令、风险提示
  ...                  # 工具特定的参考文档
```

新增工具时，在 `skills/websculpt/references/access/<工具名>/` 下创建子目录，至少包含 `guide.md`。

---

## 3. explore — 多工具配合策略层

### 3.1 定位

explore 层不仅指导"选哪个工具"，更指导"**如何组合多个工具完成复杂任务**"。例如：先用 `fetch` 探测页面结构，若遇反爬则切换至浏览器自动化，信息获取完成后用本地工具做数据清洗——这是一个多工具配合的流水线，explore 层应提供此类编排策略。

explore 层不是代码层，不产生机器可消费的结构化日志。它的产出是面向 AI 的决策参考文档。

### 3.2 目录结构

```
skills/websculpt/references/explore/
  strategy.md          # 探索策略文档
```

英文版本位于 `skills/websculpt-en/references/explore/`。

工具选择、人机协作、探索与沉淀的衔接等具体策略见 `src/explore/strategy.md`。

---

## 4. compile — 规范与校验层

### 4.1 定位

compile 层定义命令资产的编写规范。

与 access、explore 一样，它的核心产出是**面向 AI 的规范文档**，而非可执行代码。

运行时契约与编写规范见 [`skills/websculpt/references/compile/contract.md`](../skills/websculpt/references/compile/contract.md)；L1-L3 校验由 `src/cli/meta/command-validation.ts` 实现。

### 4.2 关键设计决策

- **不暴露独立 CLI**：不设 `websculpt compile` 命令。

- **"结构强制、逻辑自由"**：
  - **结构强制**：manifest 格式、导出签名、参数声明方式、禁止事项等由系统硬性约束
  - **逻辑自由**：命令内部的具体实现由 AI 根据探索结果自行编写

- **最小可运行骨架**：`command draft` 生成包含运行时签名和参数解析的最小可运行骨架（如 `export default async function(params)`），避免 AI 从零编写 boilerplate，同时不约束业务逻辑的实现方式。

- **测试由 AI 驱动**：系统不对命令资产提供自动化测试框架；命令创建后由 AI 自行调用 `websculpt <domain> <action>` 验证。WebSculpt CLI 自身有完整的测试套件（见 `tests/`），但测试对象仅限 CLI 引擎与 Meta 命令，不覆盖扩展命令的业务逻辑。

### 4.3 校验体系

`command create` 落盘前执行 L1-L3 分层校验：

| 层级 | 范围 | 实现位置 |
|------|------|----------|
| L1 结构 | manifest 字段、类型、一致性 | `src/cli/meta/command-validation.ts` |
| L2 合规 | 禁止代码模式（静态分析） | `src/cli/meta/command-validation.ts` |
| L3 契约 | 代码结构与 manifest 的一致性 | `src/cli/meta/command-validation.ts` |

**设计决策：校验为硬门槛**

L1-L3 校验失败一律阻止落盘，即使使用 `--force` 覆盖已有命令也不例外。

---

## 5. CLI — 经验沉淀框架的交互层

### 5.1 定位

CLI 不只是命令的发现、执行与管理入口，更是 Agent 将过去任务中探索出的经验**沉淀为可复用代码**，并在后续任务中**约束自身使用这些沉淀下来的代码**的系统。它是 Agent 的"外置记忆 + 行为约束层"，人类用户和 AI 共享同一套命令库界面。

### 5.2 命令分类的设计决策

- **User 覆盖 Builtin**：允许用户或 AI 沉淀的命令覆盖项目默认实现，使系统可进化。
- **Meta 不可覆盖**：保留域（如 `command`、`config`）由 CLI 自身管理，防止扩展命令破坏核心管理能力。
- **Registry Index 缓存**：CLI 启动时从 `~/.websculpt/registry-index.json` 加载清单，而非实时扫描目录树，以加速冷启动；Index 在命令变更后自动重建。

具体分类定义和解析规则见 [CLI 命令参考](CLI.md#1-命令分类与解析规则)。

### 5.3 自愈闭环与沉淀触发

命令失效时，系统不自动修复，而是触发 AI 主导的自愈流程：重新探索、修复逻辑、经 compile 校验后通过 `command create` 重新落盘。完整的提案交互流程、格式规范及自动触发机制尚未实现。

### 5.4 命令生命周期中的职责边界

`command draft` 与 `command create` 的设计分工基于一个原则：**草稿态允许试错，正式态强制合规**。

- `draft` 生成合规骨架，不校验、不注入身份字段，让 Agent 专注于业务逻辑。
- `validate` 是预检闸门，只读不落盘。
- `create` 是唯一合法入口，执行硬门槛校验、身份注入和冲突仲裁。

具体行为见 [CLI 命令参考](CLI.md)。

---

## 6. 运行时

WebSculpt 当前支持 `node` 与 `playwright-cli` 两种运行时的完整执行。`shell` 与 `python` 已完成命令包生命周期支持（`draft`、`validate`、`create` 均可生成和校验），但 CLI 执行引擎尚未接入。

---

## 7. 目录规划

### 7.1 项目目录

```
WebSculpt/
├── src/
│   ├── cli/             # 入口、引擎、Meta 命令、内置命令、校验器
│   ├── types/           # 跨层共享 TypeScript 类型定义
│   └── infra/           # 基础设施工具：用户目录路径、配置与日志读写
├── skills/websculpt/    # Agent skill 交付物（含 access、explore、compile 参考文档）
├── tests/               # 测试套件（CLI 引擎与 Meta 命令）
└── dist/                # 构建输出
```

`types/` 与 `infra/` 不属于四层业务模型，而是支撑设施：`types/` 提供跨层共享的类型契约；`infra/` 提供用户目录路径常量（`paths.ts`）和配置/日志的持久化接口（`store.ts`），被 CLI 层消费。

### 7.2 用户目录

```
~/.websculpt/
├── commands/                # 用户自定义扩展命令
├── config.json              # 用户配置
├── log.jsonl                # 扩展命令执行日志
├── audit.jsonl              # 命令安装/覆盖审计日志
└── registry-index.json      # 持久化注册表索引（命令 manifest 缓存）
```
