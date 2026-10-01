# WebSculpt

一套自进化的 Browser Use Harness，以 CLI 程序性记忆为核心。把 Agent 在浏览器中探索成功的路径沉淀为本地命令，命令库随使用自动增长。

整个系统围绕 **explore → capture → command** 的三阶段闭环运转：探索阶段完成任务并发现可复用路径，沉淀阶段把路径固化为命令资产，命令阶段被 CLI 发现、调度、复用。

## 从这里开始

- [CLI 参考](CLI.md) — 所有 Meta 命令的用法、参数、输出契约及已知限制
- [架构](Architecture.md) — 四层架构、运行时模型与目录规划，面向开发者
- [Capture](Capture.md) — 沉淀工作流的设计意图、六 Artifact 流水线、状态机与硬门槛
- [Daemon](Daemon.md) — 后台浏览器进程、IPC 协议与资源管理

## 安装

```bash
npm install -g websculpt
websculpt skill install
```

完整安装说明、快速上手与设计取舍见 [根 README](https://github.com/bqw1013/websculpt#readme)。
