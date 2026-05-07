# Playwright CLI 探索指南

> 本文档只服务于 `websculpt-explore` 阶段：连接用户已有浏览器会话、观察页面、完成信息获取并记录可复用证据。不要在本阶段创建 capture 或安装命令。

## 1. 定位

`@playwright/cli` 是探索阶段使用的浏览器自动化工具。它通过 CDP attach 连接用户已经打开的 Chrome 或 Edge，复用真实浏览器环境中的登录态、Cookie、LocalStorage 和浏览器指纹。

它适合处理：

- 登录态页面。
- JS 渲染内容。
- 多步骤交互。
- 需要像用户一样浏览和点击的任务。
- 静态抓取失败或目标站点反爬较强的场景。

WebSculpt daemon 是命令执行阶段的 browser runtime 后端；Playwright CLI 是探索阶段工具。两者不要混淆。

## 2. 前置检查

确认 Playwright CLI 可用：

```bash
playwright-cli --version
```

若不可用，向用户说明需要安装：

```bash
npm install -g @playwright/cli
```

检查当前会话：

```bash
playwright-cli list
```

处理规则：

- 若存在 `default: status: open`，直接复用该会话。
- 若存在其他 open 会话但没有 `default`，先关闭残留会话后重新 attach。
- 若没有 open 会话，引导用户开启远程调试并执行 attach。

## 3. CDP Attach

Playwright CLI 只能 attach 到用户已有浏览器实例。不要 launch 新浏览器。

请用户在 Chrome 或 Edge 中打开：

```text
chrome://inspect/#remote-debugging
```

勾选允许远程调试，并保持浏览器打开。

开始 attach 前告知用户风险：

```text
部分站点对浏览器自动化检测严格，存在账号风控或封禁风险。WebSculpt 会尽量复用真实浏览器环境并降低操作频率，但无法完全避免风险。
```

Attach 到默认会话：

```bash
playwright-cli attach --cdp=chrome --session=default
```

或：

```bash
playwright-cli attach --cdp=msedge --session=default
```

确认：

```bash
playwright-cli list
```

应看到 `default` 会话处于 open 状态。

## 4. 常用命令

| 类型 | 命令 | 用途 |
|------|------|------|
| 导航 | `goto <url>` | 打开目标页面 |
| 感知 | `snapshot` | 获取页面结构化快照和临时 ref |
| 感知 | `eval <expression>` | 在页面上下文中快速探测 DOM 或提取数据 |
| 交互 | `click <target>` | 点击元素 |
| 交互 | `fill <target> <text>` | 输入文本 |
| 交互 | `press <key>` | 按键 |
| 高级 | `run-code "<code>"` | 执行复杂 Playwright 逻辑 |
| 输出 | `screenshot` | 截图 |
| 标签页 | `tab-new [url]` | 新建标签页 |
| 标签页 | `tab-close [index]` | 关闭标签页 |

不确定参数时使用：

```bash
playwright-cli --help
playwright-cli <command> --help
```

## 5. 探索流程

### 快速探测

进入目标页面后，先判断：

- 目标内容是否已经在 DOM 中。
- 是否需要滚动、点击、搜索、分页或登录。
- 是否存在 JSON-LD、`window.__INITIAL_STATE__`、内嵌脚本数据或 API 响应线索。
- 目标元素是否有稳定标识，如 id、`data-testid`、aria label、稳定 class 或语义结构。

优先使用 `eval` 做小步验证。`snapshot` 用于理解交互元素和页面结构。

### 执行任务

选择当前最快、最稳的方式完成用户请求：

| 场景 | 推荐方式 |
|------|---------|
| 内容在 DOM 中且结构清晰 | `eval` |
| 需要多步骤交互 | `run-code` 或 snapshot + 原生命令 |
| 页面复杂且需要快速试错 | `snapshot` + `click` / `fill` / `press` |
| 只需验证元素是否存在 | `eval` 或 `snapshot` |

不要为了未来复用而牺牲当前任务速度。先完成任务，再在 Capture Assessment 中判断是否值得后续 capture。

## 6. 选择器与数据证据

探索中应优先记录稳定证据：

- 原始 URL 和必要查询参数。
- API endpoint、请求参数和响应字段。
- DOM 选择器和页面结构。
- 样例输入与样例输出。
- 登录、分页、滚动、懒加载等必要步骤。
- 失败信号，如 CAPTCHA、登录墙、空结果、结构漂移、限流。

Snapshot ref 只在当前会话中有效，不要把它当成可复用依据。若发现路径值得 capture，应记录可重建的稳定选择器或数据接口。

## 7. 登录与账号风险

当页面需要登录才能继续时：

1. 告诉用户需要登录的网站和原因。
2. 说明自动化使用登录态可能触发风控。
3. 暂停自动化，让用户在浏览器中手动登录。
4. 用户确认后刷新或重新导航继续。

标准话术：

```text
当前页面在未登录状态下无法获取 [具体内容]。请在你的浏览器中登录 [网站名]，完成后告诉我继续。
```

不要索要或处理用户密码。

## 8. 反爬与速率控制

以下信号可能说明目标站点存在反爬或访问限制：

- CAPTCHA。
- 内容不存在但在人工访问时可见。
- 连续请求后结果变空或重定向。
- 403、429、超时或异常登录提示。
- 页面要求额外验证。

处理原则：

- 降低操作频率。
- 优先复用用户真实浏览器会话。
- 避免短时间打开大量详情页。
- 保留完整 URL，不裁剪会话相关参数。
- 高风险账号操作前让用户确认。

## 9. 环境整洁

- 不主动关闭用户已有标签页。
- 任务需要新页面时使用 `tab-new`。
- 任务结束后关闭自己创建的标签页。
- 不主动断开可用的 `default` 会话。

若 attach 状态异常，可检查：

```bash
playwright-cli list
websculpt daemon status
```

必要时再考虑：

```bash
playwright-cli close-all
playwright-cli kill-all
```

强制终止浏览器进程可能丢失用户数据，必须先获得用户明确授权。

## 10. PowerShell 注意事项

PowerShell 对复杂引号和花括号不友好。若 `run-code` 因传参报错，不要反复纠缠。

优先用 `eval` 验证选择器和数据结构；复杂 runner 逻辑留给后续 `websculpt-compile` 阶段通过命令文件实现。

本阶段只需证明路径真实可行，并记录足够证据。
