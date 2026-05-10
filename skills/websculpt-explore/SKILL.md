---
name: websculpt-explore
description: 用于任何需要获取或核验外部信息的场景，包括用户明确要求查询资料，或你为完成其他任务而自行判断需要访问互联网、网站、API、浏览器会话或 WebSculpt 命令库。相比直接搜索或临时抓取，本 skill 会优先利用 WebSculpt 已积累的信息获取路径；必要时再探索新路径，减少重复试错和上下文消耗，并让成功经验有机会沉淀为后续可复用能力。在调用 WebSearch、WebFetch、curl、浏览器自动化工具或 WebSculpt 命令库之前，必须先使用本 skill；无论是响应用户的明示请求，还是你自发需要获取外部信息，都必须先遵循本探索协议，不得直接调用工具跳过 explore。
---

# WebSculpt Explore

## WebSculpt 概览

WebSculpt 把信息获取路径沉淀为本地可复用的 `domain/action` 命令。"Capture"是这一沉淀过程的术语名称，CLI 命令 `capture` 是其入口。闭环分为三个阶段：

1. **explore** — 完成信息获取任务，发现可复用路径。
2. **capture** — 整理路径证据，为后续生成命令做准备。
3. **compile** — 将验证过的路径编译成命令包，安装到命令库。

`websculpt-explore` 是第一阶段。

## 职责

你是发现与验证层。面对信息获取任务，你负责：

1. 理解要获取的信息、约束和输出形式。
2. 先检查并复用 WebSculpt 命令库；无可用命令时，选择 WebSearch、WebFetch、curl 或浏览器自动化。
3. 用小步验证推进探索，及时切换无效路径，保留失败信号。
4. 交付结果，同时记录已验证路径证据。
5. 交付后输出 Capture Assessment，将候选路径交接给 `websculpt-capture`；不要在本阶段创建 capture 工作区或生成命令资产。

## 启动协议

每次进入 explore 阶段，先执行以下协议：

1. 明确用户要获取的信息、时间范围、来源偏好和输出形式。
2. 按「查库与选工具」执行：先查库复用已有命令，无可复用时再选外部工具。
3. 若确定需要浏览器自动化，在执行前先阅读 `./references/access/playwright-cli-guide.md`。
4. 用小步验证推进探索，不要基于未跑通的猜测做后续判断，及时切换无效路径。
5. 交付结果时，在同一条回复中执行 Capture 评估并追加 Capture Assessment。

## ExploreSession（强制）

每次回复的**结尾**必须输出当前 ExploreSession 状态块。格式如下：

```yaml
ExploreSession:
  libraryChecked: false
  libraryResult: null
  guideRead: null
  toolsUsed: []
  captureAssessment:
    candidate: null
    reason: null
```

### 状态规则

- `libraryChecked` 为 `false` 时，**必须**先执行 `websculpt command list`，将结果写入 `libraryResult`，再将 `libraryChecked` 设为 `true`，然后才能继续下一步。
- `libraryResult` 必须诚实记录查库和尝试调用的结论。若复用了已有命令，写 `"复用了 <domain>/<action>"`；若无匹配，写 `"无匹配"`；若命令部分覆盖但不满足需求，写 `"<domain>/<action> 部分覆盖: <原因>，需补充探索"`。
- 若 `libraryResult` 以"需补充探索"或"无匹配"开头，**禁止直接交付结果**，必须继续使用外部工具探索。
- `guideRead` 只在你**亲自操作浏览器**（如通过 Playwright CDP attach）进行网页探索时才需要。调用命令库中 `runtime: browser` 的已有命令由后台执行，与你无关，不需要读 guide.md，`guideRead` 保持 `null` 即可。
- `toolsUsed` 记录本次探索用过的所有工具，如 `["command-reuse", "browser"]`。复用命令库已有命令也算工具使用。
- 探索结束前，`captureAssessment` 的两个字段不得为 `null`。

## 查库与选工具

### 优先复用已有命令

WebSculpt 命令库中沉淀的命令是已经验证过的信息获取路径，通常能提供高质量的结构化输出，并且能显著节省 token。在调用任何外部信息获取工具前，**必须优先尝试复用已有命令**，不要因为一次参数调错或格式不熟就放弃复用转而自行探索。

先列出当前可用的命令：

```bash
websculpt command list
```

发现候选命令后，按详细程度逐步递增的方式确认适用性。不要一上来就读最重的文档，从轻量开始，按需深入：

```bash
# 1. 快速查看参数和用法（最轻量）
websculpt <domain> <action> --help

# 2. 查看完整契约卡片：参数、运行时、前置条件
websculpt command show <domain> <action>

# 3. 包含 README 原文，用于深度确认（最重，按需使用）
websculpt command show <domain> <action> --include-readme
```

通过上述逐步确认，判断命令是否覆盖当前任务。若只覆盖子任务，复用该子任务后继续探索剩余部分。确认覆盖后直接调用。

#### 调用已有命令时的注意事项

- **若调用失败，先检查是不是参数传错了**。对照 `--help` 或 `command show` 的输出修正参数后**必须再次尝试**，不要直接放弃。至少尝试两次不同的参数组合，只有多次尝试均失败且确认不是参数问题时，才判断为命令不可用。
- **若命令返回需要浏览器环境**（如提示 `BROWSER_ATTACH_REQUIRED` 或类似信息），**立即停止**，告知用户需要开启浏览器和调试模式。不要自行尝试启动 daemon 或 attach 浏览器来绕过。只有用户明确说"不用这个命令"或"我自己处理"，才放弃该命令并进入外部工具探索。若用户明确拒绝，后续同一会话中遇到需要浏览器的命令库命令时直接跳过，不再反复询问。
- **若命令库已有命令需要浏览器执行，你不需要阅读 `guide.md`**。该命令由 WebSculpt 后台执行，与你直接操作浏览器无关，`guideRead` 状态不受影响。

完成查库和尝试调用后，更新 ExploreSession：
- `libraryChecked: true`
- `libraryResult: "<你的结论>"`
- `toolsUsed` 追加 `"command-reuse"`

### 无可复用时选择外部工具

选择能完成当前任务且最利于后续留下稳定证据的外部工具。若任务特征不明确，从轻工具开始；一旦出现 CAPTCHA、登录墙、内容需交互才可见、403、429 等结构性信号，切换到浏览器自动化。

| 场景 | 工具 | 切换信号 |
|------|------|----------|
| 需要发现信息来源、比对多个候选来源 | WebSearch | 找到权威来源后，切换到 WebFetch、curl 或浏览器验证一手内容。**注意**：搜索结果只能用于定位来源，**严禁直接沉淀**。若本次探索仅验证了搜索摘要、未通过 WebFetch/curl/浏览器读取一手内容，**直接判定为无候选**，禁止给出 domain/action 建议。 |
| URL 已知，需要读取页面正文、文档或已渲染内容 | WebFetch | 正文缺失、JS 渲染、登录墙、403/429 时切换 curl 或浏览器 |
| URL 已知，需要原始 HTTP 响应、headers、原始 HTML 或嵌入脚本数据 | curl | HTML 缺关键数据或嵌入脚本需要交互验证时切换浏览器 |
| 内容依赖登录态、JS 渲染、多步骤交互，或静态抓取失败、强反爬 | 浏览器自动化 | 需要用户登录、授权或处理高风险账号操作时请求用户介入；出现 CAPTCHA、异常验证或账号风险时降速并请求确认 |

使用外部工具后，更新 ExploreSession：
- `toolsUsed` 追加使用过的工具名称（如 `"websearch"`、`"webfetch"`、`"curl"`、`"browser"`）

## 探索闭环

执行探索不是"找完答案就结束"，而是"找答案 → 交付 → 评估"的持续循环。

探索过程中，你始终处于以下四个状态的循环中：

- **迭代逼近**：选择工具 → 执行 → 观察结果 → 决定是否继续、调整策略或切换工具。
- **按需复用**：若命令库中存在能覆盖某个子任务的命令，直接调用而非重新实现。
- **终态觉察**：持续评估目标是否达成、当前路径是否有效、是否需要切换策略或请求用户介入。
- **路径追踪**：实时记录关键 URL、选择器、API 和工具序列，为后续评估保留证据。探索时保留以下线索，便于后续 `websculpt-capture` 接手：

  - 访问过的 URL、API、页面入口。
  - 有效参数与样例输出。
  - 可复用的 DOM 选择器、JSON 字段或响应结构。
  - 失败路径、失败原因和切换策略。
  - 登录态、反爬、速率限制和环境依赖。

  只记录实际验证过的信息，不记录理论上可行但本次未跑通的路径。能拿到 API、JSON-LD 或稳定字段时，优先记录稳定接口而非脆弱 DOM。

路径切换不是失败，而是探索正常过程。切换时保留失败信号，因为这些信号对后续 capture 和 repair 都有价值。

## 人机协作边界

应请求用户介入：

- 需要付费或订阅，而当前没有可用会话。
- 已穷尽命令库、轻工具、浏览器仍无法突破权限、反爬或结构变更。
- 多条路径可行，但稳定性、速率限制或账号风险需要用户偏好取舍。
- 操作可能修改远端状态或存在明确账号风险。

应自行处理：工具选择、单次临时失败、可通过更换来源绕过的问题。

介入时必须说明：已完成什么、遇到什么障碍、建议什么方案。

## 浏览器探索

> **注意**：本节所述"浏览器自动化"指你**直接操作**浏览器进行网页探索。调用命令库中需要浏览器执行的已有命令不属于本节范围，按「查库与选工具」中的说明处理。

浏览器自动化适合登录态、JS 渲染、多步骤交互或静态抓取困难的场景。执行前必须阅读 `./references/access/playwright-cli-guide.md`。

使用浏览器自动化前，确认 ExploreSession：
- 若 `guideRead` 不为 `true`，先阅读 `./references/access/playwright-cli-guide.md`
- 阅读完成后，`guideRead: true`
- `toolsUsed` 追加 `"browser"`

## Capture 评估

探索交付时，必须在同一条回复中完成 Capture 评估并追加 Capture Assessment，禁止静默跳过。

### 何时必须评估

只要满足以下任一条件，交付时就必须执行 Capture 评估：

- 使用了 `WebSearch`、`WebFetch`、`curl` 或浏览器自动化获取信息。
- 访问了特定网站或 API 并成功提取了结构化数据。
- 发现了一条换参数即可复用的信息获取路径。

### 为什么要 Capture

`websculpt-capture` 是把本次探索验证过的信息获取路径，整理并沉淀为本地可复用命令的过程。沉淀后的命令会被安装到 WebSculpt 命令库中，下次遇到同类需求时：

- **无需重新搜索、抓取或调试**，直接调用命令即可获取结构化结果
- **节省 token 和重复探索的时间成本**
- **输出质量更稳定**，不受搜索结果波动或页面结构临时变更的影响

explore 阶段只负责发现候选路径，capture 阶段负责把路径"固化"为命令。两者分工明确，不要在 explore 阶段越俎代庖。

### 评估 Checklist

explore 只做轻量判断，不替代 capture 的全面评估。**默认结论为"无候选"**。

执行评估时，**必须先完成 Step 1 的否定检查**。若满足任一排除项，直接判定为"无候选"，**禁止继续回答 Step 2 的核心问题**。

**Step 1：强制排除检查（任一满足即终止，结论为无候选）**

- 本次只是一次性问答，没有可参数化路径。
- 只验证了搜索摘要，没有读取一手来源。
- 路径没有实际跑通，只是理论上可行。
- 输出结果不稳定，同样的输入在不同时间可能得到不同结构。

**Step 2：核心问题（仅在 Step 1 全部未通过时才回答）**

1. 本次探索是否发现了一条看起来可复用的信息获取路径？
2. 若有，候选的 `domain/action` 是什么？

若路径实际跑通且看起来可复用，可给出候选建议。具体的价值评估、查重和粒度判断由 `websculpt-capture` 负责。

### Capture Assessment 格式

输出 Assessment 前，**必须自检**：若本次主要依赖 WebSearch 且未读取一手来源，`candidate` 字段必须为"无"，不得编造 domain/action。

评估完成后，在最终回复中追加：

```text
Capture Assessment:
- 是否复用已有命令：是 / 否
- 待沉淀命令：<domain>/<action> 或无
- 评估理由：简要说明
- 建议下一步：无 / websculpt-capture
```

字段说明：

- **是否复用已有命令**：本次是否直接调用了命令库中的已有命令完成信息获取。
- **待沉淀命令**：若本次发现新的可复用路径，给出建议的 `domain/action`；若复用了已有命令或无可沉淀路径，填"无"。
- **评估理由**：一句话说明为什么建议或不建议 Capture。
- **建议下一步**：根据场景选择
  - 复用了已有命令 → "无"（命令库已覆盖，无需额外操作）
  - 发现新路径 → "websculpt-capture（将验证过的路径沉淀为本地可复用命令）"
  - 无匹配也无新路径 → "无"

Agent 在输出 Capture Assessment 后，**必须向用户简要说明沉淀建议并请求确认**，再建议进入 `websculpt-capture`。不要在用户未同意的情况下直接创建 capture 工作区。

### 状态更新

完成 Capture Assessment 后，必须同步更新 ExploreSession：
- `captureAssessment.candidate`: "<domain>/<action>" 或 `null`
- `captureAssessment.reason`: 一句话理由

然后输出完整 ExploreSession 状态块，再结束本次探索。

若`待沉淀命令`不为"无"，向用户说明 capture 的价值（将本次验证的路径沉淀为本地可复用命令，后续同类需求可直接调用、节省 token），然后建议进入 `websculpt-capture`；不要在本 skill 内创建 capture 或命令包。
