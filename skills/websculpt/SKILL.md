---
name: websculpt
description: 可扩展的信息收集 CLI 框架，用于将 AI 的概率性探索能力沉淀为确定性命令资产。在以下场景触发：(1) 用户需要自动化网页数据采集或浏览器自动化操作，(2) 需要创建、管理或执行可复用的 WebSculpt 扩展命令，(3) 需要为多步骤信息获取流程固化确定性逻辑，(4) 涉及 Playwright CLI 浏览器自动化或 CDP 调试会话的任务。
---

# WebSculpt

WebSculpt 是一个 CLI 框架，用确定性的执行层去组织 AI 在信息收集上的概率性能力。

## 安装

```bash
npm install -g websculpt
websculpt config init
```

## 核心命令

### 列出可用命令
```bash
websculpt command list
```

### 从包文件创建命令
```bash
websculpt command create <domain> <action> --from-file <path>
```

需要覆盖已有命令时加 `--force`。

### 删除用户自定义命令
```bash
websculpt command remove <domain> <action>
```

### 执行扩展命令
```bash
websculpt <domain> <action> --<param> <value>
```

## 命令资产结构

一个扩展命令由 `manifest.json` 和入口文件组成：

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  └── command.js
```

支持运行时：`node`、`playwright-cli`。

## 参考资料

- **探索策略**：[references/explore/strategy.md](references/explore/strategy.md) — 工具选择启发式规则、浏览器自动化决策框架、稳定性优先级
- **Playwright CLI 操作指南**：[references/access/playwright-cli/guide.md](references/access/playwright-cli/guide.md) — CDP 连接步骤、命令速查、`eval` 与 `run-code` 模式、反爬注意事项
