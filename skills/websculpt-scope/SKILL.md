---
name: websculpt-scope
description: 管理 WebSculpt 项目与可用命令之间的关联关系。当用户提到为项目添加/移除命令、查看项目命令范围、初始化或销毁 scope，以及按项目维度控制命令可见性时加载本 skill。
---

# WebSculpt Scope

## 定位

Scope 是 WebSculpt 的项目级命令可见性机制。随着命令库积累，全局可用的扩展命令可能包含大量与当前项目无关的条目。Scope 通过在项目目录中维护白名单，控制 `command list` 和 CLI help 默认显示的内容。

## 核心机制

- **白名单过滤**：`.websculpt/scope.json` 中列出的命令才是可见的
- **向上遍历**：系统从当前工作目录向上查找最近的 `scope.json`
- **无 scope 则全开**：未找到 scope 时，显示全部命令
- **`--all` 绕过**：`websculpt command list --all` 可临时忽略 scope 过滤

## 命令参考

### `scope init`

在当前目录初始化 scope，创建 `.websculpt/scope.json`（白名单初始为空）。

```bash
websculpt scope init
```

### `scope show`

显示当前生效的 scope 配置。从当前目录向上遍历，找到最近的 `scope.json` 后展示白名单内容及每条命令的可用状态。

```bash
websculpt scope show
```

无 scope 时返回提示，表示全部命令可见。

### `scope add <identifier>`

将命令加入当前生效的 scope 白名单。

```bash
websculpt scope add <identifier>
```

`identifier` 支持两种形式：

- `domain/action`：添加单个命令，如 `github/list-trending`
- `domain`：批量添加该域下全部现有命令，如 `github`

### `scope remove <identifier>`

将命令从当前生效的 scope 白名单中移除。

```bash
websculpt scope remove <identifier>
```

支持 `domain/action` 精确移除，或 `domain` 批量移除该域下全部命令。

### `scope destroy`

销毁当前目录的 scope，删除 `.websculpt/scope.json`。不影响祖先目录的 scope。

```bash
websculpt scope destroy
```

## 与 Capture 的关系

`capture finalize` 安装新命令后，会自动将其追加到最近的 active scope 白名单（best-effort，失败不阻断安装）。因此通过 capture 沉淀的命令通常会自动进入当前项目的视野。

## 典型场景

| 场景 | 操作 |
|------|------|
| 新项目开始，想只保留相关命令 | `scope init` + `scope add <相关命令>` |
| 命令库膨胀，当前项目视野太杂 | `scope show` 诊断 → `scope remove <无关命令>` |
| 需要查看全局命令库（不被 scope 过滤） | `websculpt command list --all` |
