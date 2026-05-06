# WebSculpt Daemon 技术文档

> 本文档面向开发者，描述 WebSculpt 后台 daemon 进程的架构设计、进程模型与资源管理策略。

---

## 1. 定位与职责

daemon 是 CLI 的命令执行引擎，负责通过 Playwright 在已有浏览器实例中运行用户命令模块。

CLI 与 daemon 的分工：

- **CLI**：命令的发现、解析、调度；按需拉起 daemon；通过 IPC 发送执行请求。
- **daemon**：维护浏览器 CDP 连接；为每个命令创建隔离页面并执行；管理内存、会话和日志。

---

## 2. 进程模型

### 2.1 自动拉起

首次执行 `playwright-cli` 命令时，CLI 通过 `ensureDaemonClient()` 自动检测并拉起 daemon：

1. 读取 daemon 状态文件（`daemon.json`）检查已有 daemon 状态
2. 若 PID 存活且 socket 可达，复用现有实例
3. 若不存在或不可达，获取跨进程锁后启动新 daemon
4. 新 daemon 启动并写入状态文件后，CLI 建立 IPC 连接

跨进程锁（`daemon-start.lock`）防止多个 CLI 进程同时启动多个 daemon 实例。

### 2.2 生命周期管理

daemon 提供以下生命周期接口：

- `daemon start`：手动启动
- `daemon stop`：优雅关闭（ graceful shutdown → 轮询确认 → SIGKILL 兜底 ）
- `daemon restart`：先停止再启动
- `daemon status`：查询健康状态
- `daemon logs`：读取最近日志

### 2.3 优雅关闭

收到停止信号时，daemon 按以下顺序关闭：

1. 停止监控并 flush metrics
2. 清理状态文件、关闭浏览器与 socket
3. 5 秒超时后强制退出

---

## 3. IPC 协议

CLI 与 daemon 通过 **Unix Domain Socket**（Linux/macOS）或 **Windows Named Pipe** 通信，传输格式为 **NDJSON**（换行分隔的 JSON），按行分割以支持流式处理多个请求/响应。

### 3.1 请求格式

```typescript
interface SocketRequest {
  id: number;      // 请求标识
  method: string;  // 方法名
  params?: Record<string, unknown>;
}
```

### 3.2 响应格式

```typescript
interface SocketResponse {
  id: number;
  result?: unknown;
  error?: { message: string; code: string };
}
```

### 3.3 主要方法

- `run`：执行命令
  - 参数：`{ commandPath: string, params: Record<string, string> }`
  - 成功返回：协议层包装为 `{ success: true, data: unknown }`，客户端解包后返回 `data`
- `health`：查询 daemon 健康状态，无需参数
- `stop`：请求优雅关闭，返回 `{ shuttingDown: true }`，无需参数

### 3.4 Health 端点返回结构

```typescript
{
  pid: number;
  uptime: number;           // 运行秒数
  healthy: true;
  degraded: boolean;        // 内存是否超过 warning 阈值
  browser: {
    connected: boolean;     // 是否已建立 CDP 连接
    lazy: boolean;          // 是否从未连接过
    pages: number;          // 当前打开页面数
  };
  sessions: {
    active: number;         // 当前执行中会话数
    max: number;            // 最大并发会话数
    total: number;          // 本次启动累计执行数
  };
  resources: {
    rssMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  limits: {
    commandTimeoutSec: number;
    maxConcurrentSessions: number;
    maxTotalPages: number;
    memoryWarningMB: number;
    memoryLimitMB: number;
    memoryEmergencyMB: number;
    restartAfterExecutions: number;
  };
}
```

---

## 4. 页面与会话管理

### 4.1 浏览器连接

daemon 内部通过 browser-manager 维护单一浏览器 CDP 连接（`chromium.connectOverCDP("chrome")`），不启动新浏览器，而是连接用户已有的 Chrome/Edge 实例。

连接具备以下容错机制：

- **惰性连接**：首次执行命令时才建立 CDP 连接。
- **并发去重**：多个同时到达的请求共享同一次连接尝试，避免弹出多个浏览器窗口。
- **自动重连**：`withBrowser` 包装器检测到连接断开（`TargetClosedError`、`ECONNRESET`、`ECONNREFUSED`、`EPIPE` 等）时，会关闭旧连接并重新连接一次。若浏览器未启动，则抛出 `PLAYWRIGHT_CLI_ATTACH_REQUIRED`。

### 4.2 页面隔离

每个命令执行时：

1. 复用浏览器的默认上下文（保留用户登录态、cookie、localStorage）
2. 在该上下文中创建新页面（page）
3. 通过动态 `import()` 加载用户命令模块，在 Node.js 进程中执行其默认导出函数，通过 Playwright API 操控页面
4. 执行完成后关闭页面

模块加载时使用 `?t=${Date.now()}` 绕过 ESM 缓存，确保命令文件修改后下次执行加载最新版本。

### 4.3 会话限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大并发会话数 | 20 | 同时执行中的命令数上限 |
| 最大总页面数 | 50 | 浏览器中打开的总页面数上限（命令内部可能额外创建页面） |
| 命令执行超时 | 20 分钟 | 测试环境可通过 `WEBSCULPT_TEST_COMMAND_TIMEOUT_MS` 覆盖 |

当达到限制时，daemon 不会排队，而是直接返回错误：

- 并发会话满 → `DAEMON_BUSY`
- 总页面数满 → `DAEMON_PAGE_LIMIT`

---

## 5. 资源管理与监控

### 5.1 内存监控

内存三级阈值（监控对象为 daemon process RSS）：

| 级别 | 阈值 | 行为 |
|------|------|------|
| Warning | 400 MB | 标记为 degraded 并记录 warning 日志；不影响请求处理，仅体现在 health 端点 |
| Limit | 600 MB | 标记为 restartPending，进入 drain 模式（拒绝新请求，现有会话完成后关闭） |
| Emergency | 1000 MB | 清理状态文件后强制退出，防止 OOM |

采样间隔为 60 秒。

### 5.2 执行次数阈值

累计执行 200 次命令后，daemon 标记为 `restartPending`。此时：

- 新请求被拒绝并返回 `DAEMON_RESTARTING`
- 现有执行中的会话继续完成
- 当活跃会话数降为 0 时，自动触发 graceful shutdown
- CLI 收到 `DAEMON_RESTARTING` 后会自动重试，拉起新 daemon 实例

### 5.3 Metrics 与日志

- **日志**：运行期间的结构化事件以 NDJSON 格式写入 `daemon.log`，包含启动/关闭事件、请求起止、内存告警、浏览器连接/断开等。
- **Metrics**：daemon 关闭时，将本次会话的汇总指标（启动时间、运行时长、执行次数、峰值并发、峰值页面数、峰值 RSS、关闭原因）flush 到 `daemon-metrics.json`。

---

## 6. 错误码

### Daemon 返回（IPC 响应）

| 错误码 | 场景 |
|--------|------|
| `INVALID_PARAMS` | 请求参数缺失或格式错误 |
| `UNKNOWN_METHOD` | 请求了不存在的 IPC 方法 |
| `PARSE_ERROR` | 收到的不是合法 JSON |
| `INTERNAL_ERROR` | socket server 内部处理异常 |
| `DAEMON_BUSY` | 并发会话数达到上限 |
| `DAEMON_PAGE_LIMIT` | 总页面数达到上限 |
| `DAEMON_RESTARTING` | daemon 处于 restartPending  drain 状态 |
| `COMMAND_TIMEOUT` | 命令执行超时（20 分钟） |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | 需要附加到现有 CDP 会话 |

### 客户端与通信层

| 错误码 | 场景 |
|--------|------|
| `DAEMON_START_FAILED` | daemon 启动失败 |
| `DAEMON_UNREACHABLE` | daemon 已启动但无法连接 |
| `SOCKET_TIMEOUT` | 客户端 socket 请求超时（60 秒） |

---

## 7. CLI 侧机制

### 跨平台启动

- **Linux/macOS**：使用 `child_process.spawn` 以 `detached: true` 启动 daemon 进程，父进程立即 `unref()`。
- **Windows**：通过临时 VBScript 调用 `WScript.Shell.Run` 启动 daemon，将 daemon 从父进程的 Job Object 中脱离，避免 shell 挂起等待 daemon 退出。启动后的 node 进程与 CLI 无父子关系，因此由 daemon 自行将 PID 写入状态文件供后续 CLI 进程发现。

### 容错重试

客户端对 `DAEMON_UNREACHABLE` 和 `DAEMON_RESTARTING` 自动重试一次。对于 unreachable 场景，客户端会比对状态文件中的 PID：若与发起请求时记录的 PID 一致，则发送 `SIGTERM` 清理僵尸进程并删除状态文件，再拉起新实例；若 PID 已变更，说明已有其他进程完成了重启，则跳过清理直接使用新实例。

