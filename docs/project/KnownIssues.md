# 已知问题

本文档记录当前实现与理想设计之间的故意或已被接受的差距。

## 1. `command show` 的功能定位已确定，待实现

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

---

## 2. `command create` 缺少审计记录

**描述**

当前 `command create` 成功落盘或覆盖命令时，没有留下审计记录。命令库的变更历史（谁/何时创建了哪个命令、是否覆盖）完全不可追溯。

**影响**

中低。不阻塞功能使用，但在命令库规模扩大或多人协作时，无法排查变更来源。

**计划修复方案**

在 `handleCommandCreate` 落盘成功后，向 `~/.websculpt/log.jsonl` 或独立的审计文件中追加创建/覆盖事件记录，包含时间戳、domain、action、来源路径、是否为覆盖操作。

---

## 3. `outputSchema` 字段已移除，待重新设计

**描述**

`outputSchema` 字段已于 2026-04-23 从 `CommandManifest` 中移除。当前没有任何代码消费输出 schema 校验，命令返回值结构由 AI 自行保证。

**影响**

低。不影响当前功能；但缺少 schema 校验意味着 AI 无法通过机器校验确认命令输出结构是否符合预期契约。

**计划修复方案**

待讨论。如有 schema 校验需求，需重新设计 `outputSchema` 字段的结构（是否采用 JSON Schema、是否仅作文档、是否参与 L1 校验），并集成到 `command-validation.ts` 中。

---

## 4. `findCommandByHost` 为死代码

**描述**

`src/cli/engine/registry.ts` 中导出了 `findCommandByHost`，但整个 CLI 没有任何调用点。该函数设计用于通过 host/关键词模糊匹配命令，但当前未集成到任何命令或工作流中。

**影响**

低。不影响功能，但增加了无意义的维护面。

**计划修复方案**

评估该功能是否必要。如不需要，直接删除；如需要，将其集成到 `command list` 的搜索过滤能力或某个新命令中。



