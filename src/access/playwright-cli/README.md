# Playwright CLI 接入模块

## 1. 概览

Playwright CLI（`@playwright/cli`）是一个基于命令行的浏览器自动化工具，封装了 Playwright 的高级 API（自动等待、智能定位器、会话管理等），通过简洁的 CLI 命令完成页面导航、元素交互、代码执行等操作。

### 核心机制

- **Snapshot**：每个命令执行后，CLI 返回当前页面的结构化快照，包含可交互元素的临时引用标识（ref，如 `e1`、`e2`）。
- **双模式操作**：既可通过原生 CLI 命令（`click`、`fill` 等）快速交互，也可通过 `run-code` 执行任意 Playwright 代码处理复杂逻辑。
- **灵活定位**：支持 snapshot ref、CSS 选择器、Playwright locator 三种元素定位方式。

### 常用命令

以下命令覆盖绝大多数自动化场景：

| 类别 | 命令 | 说明 |
|------|------|------|
| 导航 | `goto <url>` | 在当前页面导航到指定地址 |
| 感知 | `snapshot` | 获取页面结构化快照 |
| 感知 | `eval <expression>` | 在页面上下文中执行 JavaScript 表达式并返回结果 |
| 交互 | `click <target>` | 点击指定元素 |
| 交互 | `fill <target> <text>` | 在输入框填入文本 |
| 交互 | `type <text>` | 在聚焦元素上输入文本 |
| 交互 | `press <key>` | 模拟键盘按键（如 `Enter`、`ArrowDown`） |
| 高级 | `run-code "<code>"` | 执行 Playwright 代码片段，接收 `page` 对象 |
| 输出 | `screenshot` | 截取当前页面 |

完整命令列表和参数详情，请通过 `playwright-cli --help` 或 `playwright-cli <command> --help` 查阅。

### 元素定位方式

Playwright CLI 支持三种元素定位手段：

1. **Snapshot ref**（默认方式）
   执行 `snapshot` 后，页面中的可交互元素会被分配临时 ref（如 `e15`）。后续命令可直接使用 ref 操作：
   ```bash
   playwright-cli click e15
   ```

2. **CSS 选择器**
   ```bash
   playwright-cli click "#main > button.submit"
   ```

3. **Playwright locator**
   ```bash
   playwright-cli click "getByRole('button', { name: 'Submit' })"
   playwright-cli click "getByTestId('submit-button')"
   ```

> **注意**：`run-code` 中应使用稳定选择器（CSS 选择器或 Playwright locator），不要使用临时 ref。

## 2. CDP 连接与人类配合

### 排他性声明

在 WebSculpt 的上下文中，Playwright CLI **仅通过 CDP attach 使用**，即连接到用户已运行且已启用远程调试的 Chrome 或 Edge 实例。

不使用 `open` 创建新的浏览器实例，也不使用 `--extension` 等其他连接方式。这一约束的原因是：复用用户日常浏览器的登录态、Cookies 和用户配置，可显著降低反爬虫触发风险，同时避免重复登录的交互成本。

### 人机分工

CDP 连接需要人类和 AI 各完成一部分动作：

| 角色 | 职责 | 触发时机 |
|------|------|---------|
| 人类 | 在目标浏览器中启用远程调试 | 首次使用或浏览器重启后 |
| AI | 执行 `attach`、创建命名会话、诊断连接异常、引导用户重试 | 每次需要浏览器自动化时 |

### 连接流程

**第一步 — 引导用户开启远程调试**

请用户在其目标浏览器中完成以下一次性设置：

1. 新建标签页，访问 `chrome://inspect/#remote-debugging`。
2. 勾选 **"允许此浏览器实例进行远程调试"**。
3. 保持浏览器处于打开状态。

> **注意**：若目标网站需要登录，建议用户在附加前后手动完成登录。使用已登录的浏览器可降低反爬触发风险，但仍需提醒用户自动化操作存在被检测的可能。

**第二步 — AI 执行附加**

浏览器就绪后，AI 执行 attach：

```bash
# 附加到 Chrome
playwright-cli attach --cdp=chrome

# 附加到 Microsoft Edge
playwright-cli attach --cdp=msedge
```

连接成功后，CLI 返回当前页面的 snapshot，表示已进入可操作状态。

**第三步 — 命名会话（可选）**

如需在同一台机器上隔离多个任务（例如工作账号与个人账号），可在命令前添加 `-s=<name>`：

```bash
playwright-cli -s=work attach --cdp=chrome
playwright-cli -s=work goto https://example.com
```

使用非默认 session 时，后续所有命令均需带上相同的 `-s=<name>`。

### 失败排查

如果 `attach` 返回连接失败，按以下层级逐步排查：

**第一层：确认远程调试状态**

- 目标浏览器是否正在运行。
- 用户是否已访问 `chrome://inspect/#remote-debugging` 并勾选 **"允许此浏览器实例进行远程调试"**。

若未开启，重新引导用户完成连接流程的第一步。

**第二层：排查后台进程冲突**

Chrome 是多进程架构，关闭前台窗口不等于终止所有进程。残留的后台实例可能导致 remote debugging 端口被占用，使 attach 失败。

向用户确认："请确认已关闭所有 Chrome 窗口，包括系统托盘中的图标。"

若用户确认已完全关闭但仍无法 attach，进入第三层。

**第三层：强制清理与重启**

向用户说明情况并请求授权：

> "检测到系统中仍有 Chrome 后台进程占用调试端口，需要终止所有 Chrome 进程并重新启动浏览器。是否授权我执行此操作？"

获得用户明确授权后：

1. 强制终止所有 Chrome 进程。
2. 引导用户重新启动浏览器。
3. 引导用户重新开启远程调试。
4. 再次执行 `attach`。

> **注意**：强制终止浏览器进程会丢失未保存的标签页和数据，必须在获得用户明确授权后方可执行。

## 3. AI 探索策略（固化导向）

### 策略目标

你的首要目标是向用户交付正确结果。在此基础上，尽可能让探索过程中产出的代码具备可复用性——即能够直接迁移到固化的命令脚本中。

不要为了"让轨迹更漂亮"而牺牲任务完成率。没有完成任务的漂亮代码没有价值。

### 善用 help 减少试错成本

遇到不熟悉的命令或不确定的参数时，优先使用 `playwright-cli --help` 或 `playwright-cli <command> --help` 获取准确信息，避免盲目尝试导致多余的 token 消耗和页面交互。

### 什么是固化

固化指将一次性的浏览器探索过程转化为确定性的、可复用的命令资产。在 Playwright CLI 的探索场景中：

- 使用稳定选择器的 `run-code` 代码可直接复用。
- `eval` 中发现的确定性路径（如可直接请求的 API 接口）可直接复用。
- 使用临时 ref（`e15`）的原生 CLI 操作不可复现，无法固化。

### 工具分工

根据任务性质选择合适的能力，避免用重炮打蚊子：

| 能力 | 适用场景 | 固化方式 |
|------|---------|---------|
| `eval` | 快速探测 DOM、提取文本、检查元素存在性、发现确定性数据接口 | 转为 `page.evaluate()` 或替代为直接请求 |
| `run-code` | 复杂交互链（点击、填写、等待、循环） | 直接复用（使用稳定选择器时） |
| 原生 CLI `snapshot` | 理解页面结构、获取临时 ref | 不可固化 |
| 原生 CLI `click/fill` + ref | 无稳定选择器时的兜底交互 | 不可固化 |

**判断原则**：只是"看一眼、读个值"或"发现更轻量的获取路径"，用 `eval`；需要操作页面元素且该操作可能出现在固化脚本中，用 `run-code`。

### 决策优先级

1. **任务成功优先**  
   任何情况下，功能正确是第一目标。

2. **优先产出可复用的确定性代码**  
   使用 `run-code` 配合稳定选择器；或在 `eval` 中发现更轻量的确定性路径（如直接请求）时，优先采纳。

3. **原生 CLI 兜底**  
   当元素无稳定标识、需要类人视觉判断、或需要快速探测页面结构时，使用 `snapshot` 获取临时 ref，再用原生 CLI 命令交互。

4. **禁止在 `run-code` 中使用临时 ref**  
   `run-code` 里写 `page.click('e15')` 对固化毫无价值——`e15` 是临时的。如果不得不使用 ref，请使用原生 CLI 命令 `click e15`。

### 登录等人类配合场景

当 `snapshot` 或 `eval` 检测到目标内容因未登录而无法获取时：

1. 向用户明确说明需要登录的网站和原因。
2. 暂停自动化操作，等待用户在浏览器中完成登录。
3. 用户确认后，刷新页面或重新导航，继续执行。

标准话术：

> "当前页面在未登录状态下无法获取 [具体内容]。请在你的浏览器中登录 [网站名]，完成后告诉我继续。"

用户确认登录完成后，不需要重新 attach，直接继续后续操作即可。

## 附录：命令参考

### 导航

| 命令 | 说明 |
|------|------|
| `goto <url>` | 在当前页面导航到指定地址 |
| `go-back` | 后退到上一页 |
| `go-forward` | 前进到下一页 |
| `reload` | 重新加载当前页面 |

### 感知

| 命令 | 说明 |
|------|------|
| `snapshot` | 获取页面结构化快照，包含可交互元素的临时 ref |
| `snapshot --depth=N` | 限制快照深度，节省输出 |
| `eval <expression>` | 在页面上下文中执行 JavaScript 表达式并返回结果 |

### 交互

| 命令 | 说明 |
|------|------|
| `click <target>` | 点击指定元素 |
| `fill <target> <text>` | 在输入框填入文本 |
| `type <text>` | 在聚焦元素上输入文本 |
| `press <key>` | 模拟键盘按键（如 `Enter`、`ArrowDown`、`Escape`） |
| `check <target>` | 勾选复选框或单选按钮 |
| `uncheck <target>` | 取消勾选 |
| `select <target> <value>` | 在下拉框中选择选项 |
| `hover <target>` | 悬停在指定元素上 |
| `upload <file>` | 上传文件 |

### 高级

| 命令 | 说明 |
|------|------|
| `run-code "<code>"` | 执行任意 Playwright 代码片段，接收 `page` 对象 |

### 输出

| 命令 | 说明 |
|------|------|
| `screenshot [target]` | 截取当前页面或指定元素 |
| `pdf` | 将当前页面保存为 PDF |

### 标签页

| 命令 | 说明 |
|------|------|
| `tab-list` | 列出所有已打开的标签页 |
| `tab-new [url]` | 新建标签页，可选指定 URL |
| `tab-select <index>` | 切换到指定索引的标签页 |
| `tab-close [index]` | 关闭指定索引的标签页，默认关闭当前页 |

### 存储

| 命令 | 说明 |
|------|------|
| `state-save [file]` | 将 cookies 和 storage 状态保存到文件 |
| `state-load <file>` | 从文件恢复 cookies 和 storage 状态 |

### 会话

| 命令 | 说明 |
|------|------|
| `list` | 列出所有活跃的浏览器会话 |
| `close` | 关闭当前会话的浏览器 |
| `close-all` | 关闭所有会话的浏览器 |
