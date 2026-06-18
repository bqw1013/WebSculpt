---
name: websculpt-library
description: 用于整理 WebSculpt 命令库。当你觉得命令太多、想精简项目视野，或需要把命令打包迁移给他人/其他机器时加载本 skill。
---

# WebSculpt Library

## 定位

Library 负责两类常见需求：

1. **控制命令显示范围**：用 `scope` 决定当前项目里 `command list` 显示哪些命令
2. **迁移命令库**：用 `command export` / `command import` 把命令打包、分享或备份

---

## 1. 控制命令显示范围（scope）

命令库积累多了之后，`command list` 可能列出很多和当前项目无关的命令。`scope` 帮你在项目目录里维护一个允许列表，只显示当前项目需要的命令。

### 基础用法

```bash
# 在当前目录启用 scope
websculpt scope init

# 把需要的命令加进来
websculpt scope add github/list-trending
websculpt scope add github          # 批量添加 github 域下已安装的命令

# 查看当前生效列表
websculpt scope show

# 移除不需要的命令
websculpt scope remove github/list-trending
websculpt scope remove github
```

**常见注意点**：

- 启用 scope 后，白名单外的命令默认不会出现在 `command list` 里，但仍然可以直接执行。
- 想临时看到全部命令，用 `websculpt command list --all`。
- 如果当前目录没有 scope，会自动使用最近的上层 scope；都没有时显示全部命令。
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

### 基础用法

```bash
# 导出全部命令
websculpt command export --to ./my-commands

# 导出指定命令
websculpt command export github/list-trending --to ./my-commands

# 导入到本地
websculpt command import --from ./my-commands
```

### 导入时的冲突处理

- 默认情况下，如果本地已经有同名命令，会跳过不覆盖。
- 想覆盖已有命令，加 `--force`。
- 想先看看会导入哪些、有没有冲突，加 `--dry-run`。

```bash
# 预览导入结果，不实际写入
websculpt command import --from ./my-commands --dry-run

# 强制覆盖已有命令
websculpt command import --from ./my-commands --force
```

### 分享前注意

导出的命令包里如果包含 `evidence.md`，命令会给出 `EVIDENCE_INCLUDED` 警告。分享给别人之前，建议先检查一下里面是否包含敏感信息。

---

## 3. 常见场景

| 场景 | 做法 |
|------|------|
| 新项目只想看到相关命令 | `scope init` → `scope add <需要的命令>` |
| 当前项目命令列表太杂 | `scope show` 查看 → `scope remove <不需要的>` |
| 想临时查看全部命令 | `websculpt command list --all` |
| 把命令分享给团队 | `command export --to <目录>` |
| 安装别人分享的命令包 | `command import --from <目录>` |
| 换机器备份命令库 | `command export --to <目录>` → 新机器 `command import --from <目录>` |
| 预览导入效果 | `command import --from <目录> --dry-run` |
| 覆盖安装已有命令 | `command import --from <目录> --force` |
