---
name: websculpt-library
description: 整理、精简或迁移 WebSculpt 命令库。支持通过 scope 控制 `websculpt command list` 的显示范围（只列出当前项目需要的命令），支持 `command export` / `command import` 打包迁移命令库，用于备份、换机或团队分享。适用于“命令列表太杂”“只想看相关命令”“导出全部命令备份”“导入别人分享的命令包”等场景。
---

# WebSculpt Library

## 定位

Library 负责两类常见需求：

1. **控制 `command list` 的显示范围**：用 `scope` 维护一个白名单，决定 `websculpt command list` 和帮助里显示哪些命令
2. **迁移命令库**：用 `command export` / `command import` 把命令打包、分享或备份

> 重要：`scope` 只影响 `command list` 的**显示结果**，不影响命令执行。白名单外的命令仍然可以直接用 `websculpt <domain> <action>` 执行。

---

## 1. 控制命令显示范围（scope）

命令库积累多了之后，`websculpt command list` 可能列出很多和当前项目无关的命令。`scope` 帮你在项目目录里维护一个允许列表，只让相关命令出现在 `command list` 里。

### 基础用法

```bash
# 在当前目录启用 scope
websculpt scope init

# 把需要的命令加进白名单
websculpt scope add github/list-trending
websculpt scope add github          # 批量添加 github 域下已安装的全部命令

# 查看当前生效的 scope
websculpt scope show

# 从白名单移除
websculpt scope remove github/list-trending
websculpt scope remove github
```

### scope 的关键行为

- `scope` 只改变 `websculpt command list`、`websculpt command domains` 和帮助的**显示**，不改变命令是否存在或可执行。白名单外的命令仍可直接执行。
- 想临时看到全部命令，用 `websculpt command list --all`。
- 当前目录没有 scope 时，会自动向上查找**最近**的祖先 scope；都没有时才显示全部命令。
- `scope add` / `scope remove` 的 `identifier` 可以是 `domain/action`（单个命令）或 `domain`（该域下全部现有命令）。
- 通过 `capture finalize` 新安装的命令会自动加入当前项目的 scope。

### 停用 scope

```bash
# 删除当前目录的 scope
websculpt scope destroy
```

删除后，如果上层目录还有 scope，会继续生效；都没有时恢复显示全部命令。

---

## 2. 迁移命令库（export/import）

当你需要把命令分享给同事、换电脑、或者做备份时，可以把命令库导出成一个普通目录，再导入到另一个 WebSculpt 环境。

### 导出

```bash
# 导出全部命令（默认行为）
websculpt command export --to ./my-commands

# 导出指定命令或域
websculpt command export github/list-trending --to ./my-commands
websculpt command export github --to ./my-commands  # 导出 github 域下全部命令
```

**关键行为：**

- 省略 identifiers 时导出**全部已安装命令**。
- **export 不会按当前 scope 白名单过滤。** 即使项目启用了 scope，省略 identifiers 时仍然导出全部命令，等价于 `command list --all`。如果只想导出 scope 内的命令，需要根据 `scope show` 的结果手动指定 domain 或 domain/action。
- export 以最终生效视图为准（User 覆盖 Builtin），identifiers 支持混用，可以是 `domain`（该域全部）或 `domain/action`（单个命令）。
- 目标目录已存在且非空时，需要 `--force` 清空后重新写入。

### 导入

```bash
# 导入命令包
websculpt command import --from ./my-commands

# 仅预览，不写入
websculpt command import --from ./my-commands --dry-run

# 强制覆盖已有同名命令
websculpt command import --from ./my-commands --force
```

**关键行为：**

- 默认情况下，如果本地已有同名命令，会**跳过**不覆盖。
- `--force` 会覆盖已有命令；`--dry-run` 只报告会导入哪些命令、是否有冲突，不修改任何文件。
- 导入前会对包内所有命令执行校验，任一命令校验失败则整体终止，不会写入任何文件。

### 分享前注意

导出的命令包里如果包含 `evidence.md`，命令会给出 `EVIDENCE_INCLUDED` 警告。分享给别人之前，建议先检查一下里面是否包含敏感信息。

---

## 3. 常见场景

| 场景 | 做法 |
|------|------|
| 新项目只想看到相关命令 | `scope init` → `scope add <需要的命令>` |
| `command list` 列出的命令太杂 | `scope show` 查看 → `scope remove <不需要的>` |
| 想临时查看全部命令 | `websculpt command list --all` |
| 快速查看当前可用平台 | `websculpt command domains` |
| 把全部命令备份到目录 | `command export --to <目录>` |
| 只导出某个域的命令 | `command export <domain> --to <目录>` |
| 只想导出 scope 内的命令 | `scope show` 查看白名单 → 手动 `command export <domain> <domain/action>... --to <目录>` |
| 把命令分享给团队 | `command export --to <目录>` |
| 安装别人分享的命令包 | `command import --from <目录>` |
| 换机器备份命令库 | `command export --to <目录>` → 新机器 `command import --from <目录>` |
| 预览导入效果 | `command import --from <目录> --dry-run` |
| 覆盖安装已有命令 | `command import --from <目录> --force` |
