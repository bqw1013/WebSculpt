# Playwright CLI 探索指南

> 本文档只服务于 `websculpt-explore` 阶段：连接用户已有浏览器会话、观察页面、完成信息获取并记录可复用证据。不要在本阶段创建 capture 或安装命令。

## 1. 定位

`@playwright/cli` 是 explore 阶段的浏览器自动化工具，通过 CDP attach 连接到用户已打开的 Chrome，复用真实浏览器环境中的登录态、Cookie、LocalStorage 和浏览器指纹。

适用场景包括登录态页面、JS 渲染内容、多步骤交互、需要模拟真实用户浏览点击的任务，以及静态抓取失败或反爬较强的站点。

## 2. 环境准备

> Playwright CLI 只能 attach 到用户已有浏览器实例，不要 launch 新浏览器。

**explore 阶段严禁使用以下命令：**
- `open [url]` — 会 launch 新浏览器实例，违反"只 attach"原则
- `install-browser [browser]` — 不需要在 explore 阶段安装浏览器
- `attach` 时若没有可连接的会话，应按下方步骤引导用户建立连接，**禁止用 `open` 绕过**

**1. 确认 CLI 已安装**

```bash
playwright-cli --version
```

若未安装，引导用户执行：
```bash
npm install -g @playwright/cli
```

**2. 为本次 explore 创建独立会话**

在执行任何浏览器命令前，为本次 explore 生成唯一的 session 名称，例如：

```text
ws-<explore-name>-<short-suffix>
```

名称只使用小写字母、数字和连字符，应能关联当前 explore 工作区，并包含短随机后缀以避免与其他任务冲突。选定后，将名称记录到 `BrowserSession.sessionName` 和 `trace.md` 的 Protocol；attach 成功后，本次 explore 中不得更换。

```bash
playwright-cli list
```

列表中的其他 session 可能属于其他 agent 或任务，必须视为无关资源，不得复用、关闭或清理。若选定名称已经存在，但不是当前 explore 此前创建的 session，生成一个新名称。

按以下步骤建立连接：

1. 若用户尚未开启远程调试，引导其在 Chrome 中打开 `chrome://inspect/#remote-debugging`，勾选允许远程调试并保持浏览器打开。若已开启，无需重复要求。

2. 告知用户风险：

   ```text
   部分站点对浏览器自动化检测严格，存在账号风控或封禁风险。WebSculpt 会尽量复用真实浏览器环境并降低操作频率，但无法完全避免风险。
   ```

3. 使用同一个唯一名称同时指定 CLI session 和 attach session：

   ```bash
   playwright-cli -s=<session> attach --cdp=chrome --session=<session>
   ```

   > **Windows 注意**：`attach` 在该平台常表现为挂起或超时，但 CDP 连接通常已在后台成功建立。
   > 挂起可能长达数分钟（daemon 启动后会自动执行一次全量 snapshot，并对所有标签页发起 CDP 求值）；
   > attach 客户端进程也可能以 `Session closed` 报错退出，但 daemon 往往已建连成功。
   > 以上情况都以 `playwright-cli list` 为准：列表中已存在本次选定的 session 且状态为 open，即表示连接成功。
   > 后续命令直接使用该 session，无需重复 `attach`，也不要因 attach 客户端报错而放弃。

4. 确认 attach 成功：

   ```bash
   playwright-cli list
   ```

   应看到本次选定的 session 处于 open 状态。

确认后将 `sessionOwned` 和 `attached` 设为 `true`，并在 `trace.md` 的 Protocol 中记录 `Playwright session: <session>`。

除 `playwright-cli list` 外，后续每条浏览器命令都必须显式携带 `-s=<session>`。只在 attach 时指定 `--session`、后续省略 `-s`，会把命令路由到其他会话。

## 3. 操作状态确认（BrowserSession）

当 `ExploreSession.guideRead` 为 `true` 时，每次回复结尾在 ExploreSession 之后追加输出以下状态块：

```yaml
BrowserSession:
  sessionName: null
  sessionOwned: false
  attached: false
  newTabUsed: false
  ownTabVerified: false
  ownTabsClosed: false
  detached: false
  userRiskAck: false
  antiCrawlDetected: false
  evidenceRecorded: false
```

**字段说明**

- `sessionName`：本次 explore 唯一使用的 Playwright CLI session 名称。
- `sessionOwned`：该 session 是否由当前 explore 创建或确认属于当前 explore。
- `attached`：是否已成功 attach 到浏览器会话。
- `newTabUsed`：本次是否通过 `tab-new` 打开过自建页面。
- `ownTabVerified`：当前 tab 是否已通过 URL/title 检查确认属于本次 explore。
- `ownTabsClosed`：若 `newTabUsed` 为 `true`，确认所有自创建的标签页均已关闭。
- `detached`：探索结束后是否已从当前 session detach。
- `userRiskAck`：涉及登录或高风险操作时，用户是否已被告知风险并确认。
- `antiCrawlDetected`：是否观察到反爬或访问限制信号。
- `evidenceRecorded`：是否已沉淀关键证据（URL、选择器、API、步骤、失败信号）。

**关键规则**

- `sessionOwned` 为 `false` → 禁止复用、关闭或 detach 该 session。
  session 列表可能同时包含其他 agent 或任务的连接；名称存在不代表可以接管。

- `attached` 为 `false` → 禁止任何页面操作。  
  未 attach 时执行命令会直接报错，或误操作用户本地已打开的浏览器实例，造成不可预期的页面跳转或数据丢失。

- `newTabUsed` 为 `false` → 禁止在用户已有标签页上执行操作。  
  复用用户的标签页会污染其浏览状态，可能覆盖或关闭用户正在查看的内容，违反"不干扰用户"原则。

- `ownTabVerified` 为 `false` → 禁止导航、交互或关闭当前 tab。
  执行 `tab-new <url>` 后，先读取当前 URL/title 完成归属确认。不要使用可能变化的全局 tab index 猜测所有权。

- `newTabUsed` 为 `true` → 最终交付或 explore 结束前 `ownTabsClosed` 必须为 `true`。
  遗留未关闭的标签页会持续占用浏览器资源，长期累积会导致用户浏览器混乱，且可能泄露后续任务的上下文。

- 若曾 attach，explore 结束 → `detached` 必须为 `true`。
  关闭自建 tab 后，只 detach 当前 session；不得关闭浏览器或清理其他 session。

- `userRiskAck` 为 `false` → 禁止继续登录或高风险操作。  
  未经用户知情同意的自动化操作可能触发平台风控，导致用户账号被封禁或产生隐私泄露风险。

- `antiCrawlDetected` 为 `true` 时，必须同步执行降速措施。  
  不降速会加剧站点的反爬响应，可能导致 IP 被封禁、账号受限，或永久丧失对该站点的访问能力。

- `evidenceRecorded` 为 `false` → 禁止交付探索结果。  
  没有沉淀证据的探索无法被 capture 复用，等于本次验证的路径无法转化为后续可复用能力，做了白做。

## 4. 常用命令

> 任何命令的参数或行为不确定时，第一时间使用 `playwright-cli --help <command>` 查看完整签名和可用选项。这是最高效、最准确的用法来源，优先于猜测或记忆。

下表中的 `<session>` 始终替换为 `BrowserSession.sessionName`。除 `list` 外，不得省略 `-s=<session>`。

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
| Browser sessions | 会话列表、attach 和 detach |

以下是 explore 阶段高频使用的命令速查：

| 类型 | 命令 | 用途 |
|------|------|------|
| 导航 | `playwright-cli -s=<session> goto <url>` | 在当前 session 的 tab 中打开目标页面 |
| 感知 | `playwright-cli -s=<session> snapshot [target]` | 获取页面结构化快照和临时 ref |
| 感知 | `playwright-cli -s=<session> eval <func> [target]` | 在页面上下文中快速探测 DOM 或提取数据 |
| 交互 | `playwright-cli -s=<session> click <target> [button]` | 点击元素 |
| 交互 | `playwright-cli -s=<session> fill <target> <text>` | 输入文本 |
| 交互 | `playwright-cli -s=<session> press <key>` | 按键 |
| 高级 | `playwright-cli -s=<session> run-code [code]` | 执行复杂 Playwright 逻辑 |
| 输出 | `playwright-cli -s=<session> screenshot [target]` | 截图 |
| 标签页 | `playwright-cli -s=<session> tab-new [url]` | 新建并选中属于当前 session 的 tab |
| 标签页 | `playwright-cli -s=<session> tab-close` | 关闭当前 session 的 current tab |

## 5. 探索与证据

### 快速探测

**结构确认优先于数据提取**：先明确结果元素的位置、语义及不同状态下的结构变化，再编写提取逻辑。

进入目标页面后，同步完成状态判断和线索识别：

- 目标内容是否已经在 DOM 中。
- 是否需要滚动、点击、搜索、分页或登录。
- 是否存在 JSON-LD、`window.__INITIAL_STATE__`、内嵌脚本数据或 API 响应线索。
- 目标元素是否有稳定标识，如 id、`data-testid`、aria label、稳定 class 或语义结构。

优先使用 `eval` 做小步验证。`snapshot` 用于理解交互元素和页面结构。探测过程中随手记录发现的稳定线索，不要等任务结束后再补。

### 加载超时排查

若 `goto` 后页面长时间无响应或超时，可考虑以下排查策略：

- 尝试 `--wait-until=domcontentloaded` 代替默认策略，排除第三方广告/追踪脚本阻塞页面加载的可能。
- 随后使用 `wait-for <selector>` 显式等待目标元素出现，而非依赖全部资源加载完成。

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

## 8. 性能与降速

浏览器 session 长期 attach 后，Chrome 内存和 CDP 连接开销会持续累积，导致操作响应变慢甚至系统卡顿。以下做法可在**不重新 attach**、**不关闭 session** 的前提下缓解性能衰减。

### `eval` 优先于 `snapshot`

`snapshot` 会触发整页 ARIA 快照，daemon 需要遍历整棵 DOM 树并序列化为文本，数据量大且 CPU 密集。仅在以下情况使用 `snapshot`：

- 首次进入陌生页面，需要理解可交互元素结构。
- 执行了可能改变页面结构的点击、填写或翻页后。

其他情况（检查元素是否存在、提取已知字段、验证文本内容、获取简单属性）一律用 `eval`。`eval` 只执行少量 JavaScript 并返回轻量结果，对浏览器和 daemon 的压力远小于 `snapshot`。

### `goto about:blank` 作为任务缓冲

完成一个页面的信息提取后，不必立刻 `tab-close` 再新建标签页。先将当前 tab 导航至空白页：

```bash
playwright-cli -s=<session> goto about:blank
```

这能促使 Chrome 释放上一页的渲染进程、V8 Heap 和 GPU 纹理，且比 `tab-new` / `tab-close` 更轻量。缓冲后可直接用 `goto <url>` 继续下一任务，**不需要重新 attach**。

### 只维护一个自建标签页

同时打开的标签页越多，Chrome 渲染进程开销越大，且**每条命令**（包括 `tab-list` 等只读命令）都会对所有现存 tab 执行 `headerSnapshot()` 轮询。建议：

- **每个 explore session 只维护 1 个自建标签页。**
- 优先使用当前 session 的 current tab，不依赖 `tab-list` 返回的全局 index。
- 同一站点下的连续任务，若当前已在**自建标签页**中，优先用 `goto` 切换 URL，而非额外新建标签页。
- 若页面交互意外打开新 tab，将其视为当前 explore 创建的资源；先校验 URL/title，处理或关闭后再继续，不得长期保留两个 tab。

### 合并操作，减少命令条数

既然每条命令都会对**所有**已 attach 的标签页发起一轮 CDP 求值，命令条数越多，被某个无响应标签拖住的概率就越高。多步操作尽量合并进一次 `run-code` / `eval` 执行，避免拆成大量小命令。

## 9. 环境整洁

- **不要复用用户已有的标签页。** 复用用户标签页会污染其浏览状态，违反"不干扰用户"原则。
- **AI 自建的标签页可在任务间隙通过 `goto` 复用**，以减少 `tab-new` 开销；任务最终结束后必须关闭自己创建的标签页。
- 其他 session 无论状态如何都视为无关资源，不得复用、关闭或 detach。

任务结束时按以下顺序清理当前 explore 自己的资源：

```bash
playwright-cli -s=<session> eval "() => ({ url: location.href, title: document.title })"
playwright-cli -s=<session> tab-close
playwright-cli -s=<session> detach
```

`tab-close` 不传 index 时关闭当前 session 的 current tab，可避免全局 tab index 变化导致误关。若 URL/title 无法确认当前 tab 属于本次 explore，禁止关闭该 tab，仍应 detach 当前 session，并向用户报告遗留 tab。

若当前 session 状态异常，先检查连接状态：

```bash
playwright-cli list
```

只允许 detach 并重新 attach 当前 explore 的 session。重新 attach 后先将 `ownTabVerified` 设为 `false`，重新校验 URL/title，再执行任何页面操作。禁止使用 `close`、`close-all` 或 `kill-all` 处理普通故障；这些命令可能关闭用户浏览器或其他任务的 session。若问题出在 Chrome 侧（如标签页被冻结，见第10节），重新 attach 当前 session 的效果也有限。

## 10. 故障排查

### 命令持续超时（session open 但 eval/snapshot 无响应）

**症状**：`attach` 提示成功、`playwright-cli list` 显示 session open，但后续所有带 `-s=<session>` 的浏览器命令（`eval`、`snapshot`、`goto` 等）均超时。detach 并重新 attach 当前 session 后问题依旧。

**根因**：Chrome 长时间运行后，CDP WebSocket 服务可能退化僵死。此时 TCP 端口仍处于 Listen 状态，但 CDP 协议层已无响应，daemon 虽能启动却无法与浏览器通信。

**诊断**：找到 Chrome 的 `DevToolsActivePort` 文件（通常位于 Chrome 用户数据目录下），读取首行端口号和第二行的浏览器路径 ID，然后验证 CDP 是否存活：

```bash
curl -i -N -m 10 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:<port>/devtools/browser/<id>
```

- 返回 `101 WebSocket Protocol Handshake` → CDP 正常，问题在其他环节
- 连接拒绝、无响应或握手失败 → **CDP 已僵死**，需重启 Chrome

> 注意：`/json/*` HTTP 端点（如 `/json/version`）在通过 `chrome://inspect` UI 开启调试时本就返回 404，**不能**作为 CDP 僵死的判据，必须以 WebSocket 握手为准。

> 不同平台 `DevToolsActivePort` 路径不同，可搜索 `find`/`ls` 定位，或直接根据 Chrome 用户数据目录惯例推断。该文件由 Chrome 在开启远程调试时自动写入。

**修复**：告知用户 Chrome 的远程调试服务已失效，需重启 Chrome 浏览器并重新开启远程调试（`chrome://inspect/#remote-debugging`），然后使用原 session 名重新 `attach`。清理 Playwright CLI session 无法替代重启 Chrome。

### 命令分钟级延迟，但最终成功返回

**症状**：命令不报错，但每条挂起 1-5 分钟才返回正确结果；连续执行后逐次变快，最终恢复秒回。常见于 Chrome 长时间运行、标签页较多时。

**可能原因**（尚未完全验证）：后台标签页被 Chrome 或系统限流/冻结（如 Windows 11 效率模式、Chrome 节能模式），而 CLI 每条命令都会对所有标签页发起 CDP 求值，整条命令被一个无响应的标签拖住；慢命令本身会触发标签唤醒，因此连续执行后自愈。下次出现时可在变慢状态下打开 `chrome://discards` 查看各标签的 Lifecycle State 佐证，或检查任务管理器中 Chrome 进程是否被系统置为效率模式。

**处置**（按序尝试，均不涉及操作用户的标签页）：

1. **预热重试**：在当前 session 的自建 tab 上连续执行 2-3 条轻量 `eval`，容忍第一条的分钟级延迟——它同时是解冻过程，之后通常自行恢复。
2. **detach + 重新 attach 当前 session**：预热无效时执行，只重建当前 explore 的连接。
3. **请用户重启浏览器**：以上均无效时，告知用户重启 Chrome 并重新开启远程调试。

---

## 11. PowerShell 注意事项

PowerShell 对复杂引号和花括号不友好。若 `run-code` 因传参报错，优先改用 `eval` 验证选择器和数据结构，不要反复纠缠；复杂 runner 逻辑留给后续 `websculpt-capture` 阶段通过命令文件实现。
