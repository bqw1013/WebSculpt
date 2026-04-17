# WebSculpt 三层架构提案

## 1. 为什么要分三层

DESIGN.md 写道：

> 代码负责边界、约束、状态、执行与审计。AI 负责理解、归纳、补全、判断与翻译。

三层架构正是为了贯彻这一分工：

- **access** — 代码确保工具就绪（基础设施、连接）。AI 直接操作工具。
- **explore** — 代码提供决策素材并强制记录。AI 自主选择路径。
- **compile** — 代码从已记录的探索日志中生成确定性资产。

## 2. access — 基础设施就绪层

### 职责

确保网络访问工具处于运行且可连接状态。**不要**将 agent 的能力封装成新的 API。

### access 做什么

- 环境检查与工具启动（例如 CDP Proxy 运行在 localhost:3456）
- 报告连接状态
- 提供幂等的基础设施 ensure 入口（例如 `ensureCDPProxy()`）
- 提供每个工具的操作参考文档（放在各自的子目录中）

### access 不做什么

- 不预定义操作 API（如 `browser.click()`）
- 不做路由决策（"这个任务应该用 CDP"）
- 不编排操作序列

### 目录结构

```
src/access/
  README.md           # 契约总纲：可用工具、类型、状态
  cdp/
    README.md         # 连接信息、端点参考、生命周期说明
    index.ts          # 对外入口：导出 ensureCDPProxy()
    types.ts          # 结构化结果与 CDP 相关类型
    chrome.ts         # Chrome 调试端口发现
    proxy.ts          # 生命周期管理：健康检查、启动、等待 ready
    server.ts         # HTTP-to-CDP bridge
  # playwright/       # 预留
  # jina/             # 预留
```

### 当前落地状态

这部分已经不只是结构设想，`src/access/cdp/` 已经作为第一份真实实现落地。

当前实现保持了 access 层应有的克制：它只负责“把基础设施准备好”，不进一步抽象浏览动作本身。对上层来说，稳定契约只有一个程序化入口 `ensureCDPProxy()`，它完成的事情包括：

- 从 `~/.websculpt/config.json` 读取 `cdpProxyPort`，默认使用 `3456`
- 先通过 `GET /health` 判断目标端口上是否已经有健康的 proxy
- 自动发现 Chrome 的 remote-debugging 端口，优先读取 `DevToolsActivePort`，失败时回退到常见端口扫描
- 必要时以 detached 进程启动本地 `server.ts`
- 将长期运行日志写到 `~/.websculpt/logs/cdp-proxy.log`
- 返回结构化结果 `ok / url / chromePort / reason`，把后续决策留给 explore 或更上层调用者

换句话说，access 现在已经把“CDP 可用性”从一套散落在 skill 里的环境假设，收敛成了 WebSculpt 自己管理的一层基础设施能力。

### access/README.md 内容示例

```markdown
## 契约

### access 提供
- 环境检查与工具启动
- 工具连接状态报告
- 各工具的操作参考（子目录 README）

### access 不提供
- 预定义的操作 API
- 路由决策
- 操作编排

## 当前可用基础设施

| 工具       | 类型           | 状态  | 位置     |
|------------|----------------|-------|----------|
| CDP Proxy  | 浏览器自动化   | 就绪  | `cdp/`   |
| SearchWeb  | 搜索           | 原生  | Agent    |
| FetchURL   | 静态抓取       | 原生  | Agent    |

## 新增基础设施的规范

在 `src/access/<工具名>/` 下创建子目录，包含：
1. `README.md` — 连接地址与操作参考
2. 启动 / 连接代码

然后在上方表格中注册。
```

### CDP 示例（cdp/README.md）

```markdown
## CDP Proxy

### 生命周期
access 在 explore 启动前确保 Proxy 已就绪；如果已有实例健康可用则直接复用，否则尝试自动拉起。

### 操作参考
Proxy 就绪后，agent 直接通过 HTTP API 操作：

- `GET /health` — 查看代理状态与 Chrome 连接情况
- `GET /targets` — 枚举当前页面
- `GET /new?url=...` — 创建新的后台 tab
- `POST /eval?target=ID` — 执行 JS
- `POST /click?target=ID` — 点击元素
- `GET /screenshot?target=ID&file=...` — 截图
- `GET /scroll?target=ID&y=3000` — 滚动
- ...

这里不额外定义 `createTab()` / `browser.click()` 之类的新接口；
直接使用 HTTP API 本身就是稳定契约。
```

## 3. explore — 探索执行层

### 职责

为 AI 组装上下文、定义成功标准，并**强制记录**每一步操作到结构化探索日志中。**不要**将操作序列硬编码。

### 提供给 AI 的决策素材

1. **可用工具** — 来自 access 层
2. **站点经验** — 来自 `sites/` 目录（见第 4 节）
3. **启发式策略** — 指导原则，非硬规则
4. **成功标准** — 什么算"完成"

### 启发式策略（可被覆盖）

- 先轻后重：优先尝试 fetch，遇反爬或需交互再启用 CDP
- 一手信息优先：搜索引擎定位来源后，直接访问原始页面核实
- 先结构后交互：进入页面后先用 `/eval` 探测 DOM，再决定是否需要 GUI 点击

这些是**参考资料**，不是代码强制执行的规则。AI 在具体场景中可覆盖它们。

### 核心产出：探索日志

无论 AI 选择了什么工具、什么顺序，explore 必须产出结构化日志。这是 compile 的唯一输入。

### 目录结构

```
src/explore/
  README.md          # 策略指南 + 日志格式定义
  session.ts         # 会话生命周期：初始化上下文、组装素材、结束清理
  logger.ts          # 标准化日志写入
```

## 4. sites — 站点经验库

### 职责

一个独立的已验证平台经验知识库。被三层共享：

- **access** 可读取它作为 provider 路由参考
- **explore** 将它作为 AI 的决策素材
- **compile** 在生成命令文档时引用它

### 位置

```
WebSculpt/
  sites/                     # 内置经验（随项目分发）
    weibo.com.md
    xiaohongshu.md
  ...
```

用户本地镜像：

```
~/.websculpt/
  sites/                     # 用户积累的站点经验（覆盖 / 扩展内置）
  commands/
  logs/
  config.json
  log.jsonl
```

### 查找优先级

用户层（`~/.websculpt/sites/`）> 内置层（`sites/`）

与命令一致：同名文件用户层优先。

### 文件格式

标准 Markdown + YAML frontmatter：

```markdown
---
domain: example.com
aliases: [示例]
updated: 2026-04-17
---

## 平台特征
架构、反爬行为、登录需求、内容加载方式等。

## 有效模式
已验证的 URL 模式、操作策略、选择器。

## 已知陷阱
什么会失败以及原因。
```

### 为什么不叫 "references/site-patterns"

- "references" 暗示可选参考资料；站点经验是项目的核心运营资产。
- "patterns" 把范围窄化为正则 / 选择器，但每份文件还包含策略、陷阱和平台特征。

## 5. commands — 确定性资产

### 职责

compile 层产出的已固化、机器可执行命令。与 `sites/` 中的概率性知识形成镜像。

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

### 与 sites 的关系

| 层级     | 内容类型         | 格式           | 消费者 |
|----------|------------------|----------------|--------|
| sites    | 概率性经验       | Markdown（自然语言） | AI     |
| commands | 确定性逻辑       | 代码 + manifest | 机器   |

当站点变更导致命令失效时，自愈闭环为：

```
命令失效
  -> 带着 sites 上下文进行 explore
  -> 修复逻辑
  -> compile 生成新版本命令
```

## 6. 完整目录规划

```
WebSculpt/
├── src/
│   ├── access/              # 基础设施就绪
│   ├── explore/             # 探索会话与记录
│   ├── compile/             # 日志到命令包的生成
│   └── cli/                 # CLI 入口与路由
├── sites/                   # 站点经验库（内置）
├── commands/                # 内置扩展命令
├── tests/
├── openspec/
└── dist/
```

用户主目录：

```
~/.websculpt/
├── sites/                   # 用户站点经验
├── commands/                # 用户扩展命令
├── logs/                    # 长期运行的基础设施日志
│   └── cdp-proxy.log
├── config.json
└── log.jsonl
```

## 7. 待确定问题

- compile 的输出是直接写到 `~/.websculpt/commands/`，还是复用现有的 `command create` API？
- 探索日志被 compile 消费时的确切 schema 是什么？
- AI 直接操作工具时，explore 如何检测成功 / 失败？
- `sites` 文件是否允许 AI 在探索过程中直接写入，还是仅限人工审核后写入？
