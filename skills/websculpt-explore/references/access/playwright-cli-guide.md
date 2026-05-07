# Playwright CLI 探索指南

> 本文档只服务于 `websculpt-explore` 阶段：连接用户已有浏览器会话、观察页面、完成信息获取并记录可复用证据。不要在本阶段创建 capture 或安装命令。

## 1. 定位

`@playwright/cli` 是 explore 阶段的浏览器自动化工具，通过 CDP attach 连接到用户已打开的 Chrome 或 Edge，复用真实浏览器环境中的登录态、Cookie、LocalStorage 和浏览器指纹。

适用场景包括登录态页面、JS 渲染内容、多步骤交互、需要模拟真实用户浏览点击的任务，以及静态抓取失败或反爬较强的站点。

## 2. 环境准备

> Playwright CLI 只能 attach 到用户已有浏览器实例，不要 launch 新浏览器。

**1. 确认 CLI 已安装**

```bash
playwright-cli --version
```

若未安装，引导用户执行：
```bash
npm install -g @playwright/cli
```

**2. 检查并处理会话**

```bash
playwright-cli list
```

根据输出选择对应操作：
- 存在 `default: status: open` → 直接复用该会话
- 存在其他 open 会话但无 `default` → 先关闭残留会话，再重新 attach
- 无 open 会话 → 按以下步骤建立连接：

  1. 引导用户在 Chrome 或 Edge 中打开 `chrome://inspect/#remote-debugging`，勾选允许远程调试并保持浏览器打开

  2. 告知用户风险：

     ```text
     部分站点对浏览器自动化检测严格，存在账号风控或封禁风险。WebSculpt 会尽量复用真实浏览器环境并降低操作频率，但无法完全避免风险。
     ```

  3. Attach 到默认会话：

     ```bash
     playwright-cli attach --cdp=chrome --session=default
     ```

     或：

     ```bash
     playwright-cli attach --cdp=msedge --session=default
     ```

  4. 确认 attach 成功：

     ```bash
     playwright-cli list
     ```

     应看到 `default` 会话处于 open 状态。

## 3. 操作状态确认（BrowserSession）

当 `ExploreSession.guideRead` 为 `true` 时，每次回复结尾在 ExploreSession 之后追加输出以下状态块：

```yaml
BrowserSession:
  attached: false
  newTabUsed: false
  ownTabsClosed: false
  userRiskAck: false
  antiCrawlDetected: false
  evidenceRecorded: false
```

**字段说明**

- `attached`：是否已成功 attach 到浏览器会话。
- `newTabUsed`：本次是否通过 `tab-new` 打开过新页面（执行过至少一次即为 `true`，不追踪数量）。
- `ownTabsClosed`：若 `newTabUsed` 为 `true`，确认所有自创建的标签页均已关闭。
- `userRiskAck`：涉及登录或高风险操作时，用户是否已被告知风险并确认。
- `antiCrawlDetected`：是否观察到反爬或访问限制信号。
- `evidenceRecorded`：是否已沉淀关键证据（URL、选择器、API、步骤、失败信号）。

**关键规则**

- `attached` 为 `false` → 禁止任何页面操作。  
  未 attach 时执行命令会直接报错，或误操作用户本地已打开的浏览器实例，造成不可预期的页面跳转或数据丢失。

- `newTabUsed` 为 `false` → 禁止在用户已有标签页上执行操作。  
  复用用户的标签页会污染其浏览状态，可能覆盖或关闭用户正在查看的内容，违反"不干扰用户"原则。

- `newTabUsed` 为 `true` → 回复结束前 `ownTabsClosed` 必须为 `true`。  
  遗留未关闭的标签页会持续占用浏览器资源，长期累积会导致用户浏览器混乱，且可能泄露后续任务的上下文。

- `userRiskAck` 为 `false` → 禁止继续登录或高风险操作。  
  未经用户知情同意的自动化操作可能触发平台风控，导致用户账号被封禁或产生隐私泄露风险。

- `antiCrawlDetected` 为 `true` 时，必须同步执行降速措施。  
  不降速会加剧站点的反爬响应，可能导致 IP 被封禁、账号受限，或永久丧失对该站点的访问能力。

- `evidenceRecorded` 为 `false` → 禁止交付探索结果。  
  没有沉淀证据的探索无法被 capture 复用，等于本次验证的路径无法转化为后续可复用能力，做了白做。

## 4. 常用命令

> 任何命令的参数或行为不确定时，第一时间使用 `playwright-cli --help <command>` 查看完整签名和可用选项。这是最高效、最准确的用法来源，优先于猜测或记忆。

Playwright CLI 的命令按功能分为以下类别。每个类别下通常包含多个子命令，explore 阶段主要使用 Core、Tabs 和 Navigation 类别中的命令，但遇到特定需求时（如查看网络请求、操作 Cookie、生成元素定位器），可先定位到对应类别，再用 `--help` 查看该类别下的完整命令。

| 类别 | 典型用途 |
|------|---------|
| Core | 页面导航、快照、元素交互、表单填写 |
| Navigation | 前进、后退、刷新 |
| Keyboard / Mouse | 键盘输入、鼠标移动、滚动、拖拽 |
| Save as | 截图、保存 PDF |
| Tabs | 新建、关闭、切换标签页 |
| Storage | Cookie、LocalStorage、SessionStorage 的读写 |
| Network | 查看请求/响应、拦截网络、设置离线状态 |
| DevTools | 执行 Playwright 代码、查看控制台、生成定位器 |
| Browser sessions | 会话列表、清理残留 |

以下是 explore 阶段高频使用的命令速查：

| 类型 | 命令 | 用途 |
|------|------|------|
| 导航 | `goto <url>` | 打开目标页面 |
| 感知 | `snapshot [target]` | 获取页面结构化快照和临时 ref |
| 感知 | `eval <func> [target]` | 在页面上下文中快速探测 DOM 或提取数据 |
| 交互 | `click <target> [button]` | 点击元素 |
| 交互 | `fill <target> <text>` | 输入文本 |
| 交互 | `press <key>` | 按键 |
| 高级 | `run-code [code]` | 执行复杂 Playwright 逻辑 |
| 输出 | `screenshot [target]` | 截图 |
| 标签页 | `tab-new [url]` | 新建标签页 |
| 标签页 | `tab-close [index]` | 关闭标签页 |

## 5. 探索与证据

### 快速探测

进入目标页面后，同步完成状态判断和线索识别：

- 目标内容是否已经在 DOM 中。
- 是否需要滚动、点击、搜索、分页或登录。
- 是否存在 JSON-LD、`window.__INITIAL_STATE__`、内嵌脚本数据或 API 响应线索。
- 目标元素是否有稳定标识，如 id、`data-testid`、aria label、稳定 class 或语义结构。

优先使用 `eval` 做小步验证。`snapshot` 用于理解交互元素和页面结构。探测过程中随手记录发现的稳定线索，不要等任务结束后再补。

### 执行任务

选择当前最快、最稳的方式完成用户请求：

| 场景 | 推荐方式 |
|------|---------|
| 内容在 DOM 中且结构清晰 | `eval` |
| 数据来自 API 而非直接渲染在 DOM 中 | `requests` + `response-body` |
| 需要多步骤交互 | `run-code` 或 snapshot + 原生命令 |
| 页面复杂且需要快速试错 | `snapshot` + `click` / `fill` / `press` |
| 只需验证元素是否存在 | `eval` 或 `snapshot` |

不要因为追求"记录完美"而阻塞任务交付。关键证据在执行过程中顺手记下，事后只在 Capture Assessment 中做最终取舍。

### 边执行边记录

探索过程中实时沉淀以下证据，为后续 capture 保留可复用路径：

- **原始 URL 和必要查询参数**。
- **API endpoint、请求参数和响应字段** —— 优先记录稳定接口，而非脆弱 DOM。
- **DOM 选择器和页面结构** —— 使用 id、`data-testid`、aria label、稳定 class 等可重建的标识。snapshot ref 只在当前会话有效，不要作为可复用依据。
- **样例输入与样例输出**。
- **必要步骤**，如登录、分页、滚动、懒加载。
- **失败信号**，如 CAPTCHA、登录墙、空结果、结构漂移、限流。

## 6. 登录与账号风险

> 复用用户真实浏览器的登录态是 Playwright CLI 的核心优势之一。若页面需要登录，**不要因流程繁琐而切换为 curl 或 WebFetch**。按以下步骤引导用户完成即可。

当页面需要登录才能继续时：

1. 告诉用户需要登录的网站和原因。标准话术：

   ```text
   当前页面在未登录状态下无法获取 [具体内容]。请在你的浏览器中登录 [网站名]，完成后告诉我继续。
   ```

2. 说明自动化使用登录态可能触发风控。
3. 暂停自动化，让用户在浏览器中手动登录。**不要索要或处理用户密码。**
4. 用户确认后刷新或重新导航继续。

## 7. 反爬与速率控制

若页面出现 CAPTCHA、403/429、内容人工可见但自动化获取为空、连续请求后异常重定向、或要求额外验证，说明存在反爬或访问限制。此时应：

- 降低操作频率
- 优先复用用户真实浏览器会话
- 避免短时间打开大量详情页
- 保留完整 URL，不裁剪会话相关参数
- 高风险账号操作前让用户确认

## 8. 环境整洁

- **任何任务都通过 `tab-new` 创建新页面，不要复用用户已有的标签页。**
- **任务结束后必须关闭自己创建的标签页。**
- 不主动断开可用的 `default` 会话。

若 attach 状态异常，先检查连接状态：

```bash
playwright-cli list
```

若仍无法恢复，清理会话后重新建立连接：

```bash
playwright-cli close-all
# 或
playwright-cli kill-all
```

清理完成后，按第2节"环境准备"中的步骤重新 attach。

> 强制终止浏览器进程可能丢失用户数据，必须先获得用户明确授权。

## 9. PowerShell 注意事项

PowerShell 对复杂引号和花括号不友好。若 `run-code` 因传参报错，优先改用 `eval` 验证选择器和数据结构，不要反复纠缠；复杂 runner 逻辑留给后续 `websculpt-capture` 阶段通过命令文件实现。
