---
name: websculpt-library
description: 负责命令库的组织治理。当用户需要控制哪些命令可见/可用（觉得命令太多、项目用不到某些命令、想精简视野），或需要将命令打包迁移（导出给他人、从他人处导入、跨机器搬运、备份命令库）时加载本 skill。底层通过 scope 子命令管理项目级白名单，通过 command export/import 实现命令库的可移植打包与共享。
---

# WebSculpt Library

## 定位

Library 是 WebSculpt 的命令库治理层，负责两项职责：

1. **可见性控制（scope）**：项目级白名单，决定 `command list` 显示什么，不改变命令的执行或权限，只过滤"能看到什么"
2. **可移植共享（export/import）**：跨安装打包命令库，用于团队共享、跨机器迁移或备份

## 1. 可见性控制（scope）

Scope 是 WebSculpt 的项目级命令可见性机制。随着命令库积累，全局可用的扩展命令可能包含大量与当前项目无关的条目。Scope 通过在项目目录中维护白名单，控制 `command list` 默认显示的内容。

### 核心机制

- **白名单过滤**：`.websculpt/scope.json` 中列出的命令才是可见的
- **向上遍历**：系统从当前工作目录向上查找最近的 `scope.json`
- **无 scope 则全开**：未找到 scope 时，显示全部命令
- **`--all` 绕过**：`websculpt command list --all` 可临时忽略 scope 过滤

### 命令参考

#### `scope init`

在当前目录初始化 scope，创建 `.websculpt/scope.json`（白名单初始为空，此时 `command list` 不显示任何扩展命令，需通过 `scope add` 显式添加后才可见）。

```bash
websculpt scope init
```

#### `scope show`

显示当前生效的 scope 配置。从当前目录向上遍历，找到最近的 `scope.json` 后展示白名单内容及每条命令的可用状态。

```bash
websculpt scope show
```

无 scope 时返回提示，表示全部命令可见。

#### `scope add <identifier>`

将命令加入当前生效的 scope 白名单。

```bash
websculpt scope add <identifier>
```

`identifier` 支持两种形式：

- `domain/action`：添加单个命令，如 `github/list-trending`
- `domain`：批量添加该域下**当前已安装的**全部命令，如 `github`。注意这是快照操作，后续通过 capture 新沉淀的同域命令不会自动加入，需再次 add。

#### `scope remove <identifier>`

将命令从当前生效的 scope 白名单中移除。

```bash
websculpt scope remove <identifier>
```

支持 `domain/action` 精确移除，或 `domain` 批量移除该域下全部命令。

#### `scope destroy`

销毁当前目录的 scope，删除 `.websculpt/scope.json`。销毁后，scope 向上回退到最近的祖先 `scope.json`；若祖先也无 scope，则恢复全部命令可见。不影响祖先目录的 scope。

```bash
websculpt scope destroy
```

### 与 Capture 的关系

`capture finalize` 安装新命令后，会自动将其追加到最近的 active scope 白名单（best-effort，失败不阻断安装）。若当前目录链上不存在任何 scope，此步骤自动跳过，此时命令本身即为全局可见。因此通过 capture 沉淀的命令通常会自动进入当前项目的视野。

---

## 2. 可移植共享（export/import）

当需要将命令库从一个 WebSculpt 安装迁移到另一个时，使用 export/import。导出产物是一个普通目录，可提交到 Git 或通过任意方式分发。

### 导出包结构

```
<dir>/
  ├── index.json          ← 导出的命令列表
  └── commands/
      └── <domain>/
          └── <action>/
              ├── manifest.json
              ├── command.js
              ├── README.md      （如存在）
              ├── context.md     （如存在）
              └── evidence.md    （如存在）
```

### 命令参考

#### `command export`

将当前可见的扩展命令导出为可移植目录包。导出以 User 覆盖 Builtin 后的最终生效视图为准（等价于 `command list --all`，不受 scope 白名单限制）。

```bash
websculpt command export [identifiers...] --to <dir> [--force]
```

| 选项 / 参数 | 说明 |
|------|------|
| `--to <dir>` | 导出目标目录（**必填**） |
| `--force` | 覆盖非空目标目录 |
| `[identifiers...]` | 可选，要导出的命令：`domain`（该域下全部）或 `domain/action`（单个）。省略时导出全部 |

#### `command import`

将导出的命令包安装到本地用户命令库。

```bash
websculpt command import --from <dir> [--force] [--dry-run]
```

| 选项 | 说明 |
|------|------|
| `--from <dir>` | 导出包目录路径（**必填**） |
| `--force` | 覆盖已存在的同名用户命令 |
| `--dry-run` | 仅校验和报告冲突，不写入任何文件 |

### 关键行为

- 导入前对所有命令执行 L1–L3 分层校验：任一命令校验不通过则整体终止，不写入任何文件
- 同名用户命令已存在时：默认跳过，`--force` 覆盖
- 导出目标目录已存在且非空时需 `--force`
- 导出命令中包含 `evidence.md` 时会给出 `EVIDENCE_INCLUDED` 警告
- `--dry-run` 模式下不执行任何写入，也不修改 registry

---

## 典型场景

| 场景 | 操作 |
|------|------|
| 新项目开始，想只保留相关命令 | `scope init` + `scope add <相关命令>` |
| 命令库膨胀，当前项目视野太杂 | `scope show` 诊断 → `scope remove <无关命令>` |
| 需要查看全局命令库（不被 scope 过滤） | `websculpt command list --all` |
| 将命令分享给团队其他成员 | `command export --to <dir>` 打包 → 分享目录 |
| 从团队接收命令包并安装 | `command import --from <dir>` |
| 迁移到新机器，备份当前命令库 | `command export --to <备份目录>` → 在新机器上 `command import --from <备份目录>` |
| 预览导入效果，不实际写入 | `command import --from <dir> --dry-run` |
| 覆盖安装已有命令 | `command import --from <dir> --force` |
