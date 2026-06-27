# WebSculpt Daemon Technical Documentation

> This document is intended for developers and describes the architecture design, process model, and resource management strategy of the WebSculpt background daemon process.

---

## 1. Role and Responsibilities

The daemon is the command execution engine of the CLI, responsible for running user command modules in an existing browser instance via Playwright.

Division of labor between CLI and daemon:

- **CLI**: Command discovery, parsing, and scheduling; launching the daemon on demand; sending execution requests via IPC.
- **daemon**: Maintaining browser CDP connections; creating isolated pages for each command and executing them; managing memory, sessions, and logs.

> **Relationship with `@playwright/cli`**: `@playwright/cli` is a standalone CLI tool used by the Agent during the **exploration phase** (providing commands such as `attach`, `eval`, `snapshot`). The WebSculpt daemon connects directly to the browser via `connectOverCDP` from `playwright-core` during the **execution phase**, and does not depend on any process or session management from the `@playwright/cli` package.

---

## 2. Process Model

### 2.1 Auto-Start

When a command with `runtime: "browser"` is executed for the first time, the CLI automatically detects and starts the daemon via `ensureDaemonClient()`:

1. Read the daemon status file (`daemon.json`) to check for an existing daemon instance.
2. If the PID is alive and the socket is reachable, reuse the existing instance.
3. If it does not exist or is unreachable, acquire a cross-process lock and start a new daemon.
4. After the new daemon starts and writes the status file, the CLI establishes an IPC connection.

The cross-process lock (`daemon-start.lock`) prevents multiple CLI processes from starting multiple daemon instances simultaneously.

### 2.2 Lifecycle Management

The daemon provides the following lifecycle interfaces:

- `daemon start`: Manual start
- `daemon stop`: Graceful shutdown (graceful shutdown -> poll for confirmation -> SIGKILL fallback)
- `daemon restart`: Stop then start
- `daemon status`: Query health status
- `daemon logs`: Read recent logs

### 2.3 Graceful Shutdown

When a stop signal is received, the daemon shuts down in the following order:

1. Stop monitoring and flush metrics.
2. Clean up the status file, close the browser, and close the socket.
3. Force exit after a 5-second timeout.

---

## 3. IPC Protocol

The CLI and daemon communicate via **Unix Domain Socket** (Linux/macOS) or **Windows Named Pipe**, using **NDJSON** (newline-delimited JSON) as the transport format. Messages are split by line to support streaming processing of multiple requests/responses.

### 3.1 Request Format

```typescript
interface SocketRequest {
  id: number;      // Request identifier
  method: string;  // Method name
  params?: Record<string, unknown>;
}
```

### 3.2 Response Format

```typescript
interface SocketResponse {
  id: number;
  result?: unknown;
  error?: { message: string; code: string };
}
```

### 3.3 Main Methods

- `run`: Execute a command
  - Parameters: `{ commandPath: string, params: Record<string, string> }`
  - On success: The protocol layer wraps the response as `{ success: true, data: unknown }`, and the client unpacks and returns `data`
- `health`: Query daemon health status; no parameters required
- `stop`: Request graceful shutdown; returns `{ shuttingDown: true }`; no parameters required

### 3.4 Health Endpoint Response Structure

```typescript
{
  pid: number;
  uptime: number;           // Seconds since start
  healthy: true;
  degraded: boolean;        // Whether memory exceeds the warning threshold
  browser: {
    connected: boolean;     // Whether a CDP connection has been established
    lazy: boolean;          // Whether a connection has never been made
    pages: number;          // Number of currently open pages
  };
  sessions: {
    active: number;         // Number of currently executing sessions
    max: number;            // Maximum concurrent sessions
    total: number;          // Cumulative executions since this start
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

## 4. Page and Session Management

### 4.1 Browser Connection

The daemon internally maintains a single browser CDP connection via `browser-manager` (`chromium.connectOverCDP("chrome")`). It does not launch a new browser; instead, it connects to the user's existing Chrome instance.

The connection includes the following fault-tolerance mechanisms:

- **Lazy connection**: The CDP connection is established only when a command is executed for the first time.
- **Concurrent deduplication**: Multiple simultaneous requests share the same connection attempt, preventing multiple browser windows from popping up.
- **Auto-reconnect**: When the `withBrowser` wrapper detects a disconnected connection (`TargetClosedError`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, etc.), it closes the old connection and reconnects once. If the browser is not started, it throws `BROWSER_ATTACH_REQUIRED`.

### 4.2 Page Isolation

When each command is executed:

1. Reuse the browser's default context (preserving user login state, cookies, localStorage).
2. Create a new page within that context.
3. Load the user command module via dynamic `import()`, execute its default exported function in the Node.js process, and manipulate the page through the Playwright API.
4. Close the page after execution completes.

Module loading uses `?t=${Date.now()}` to bypass ESM caching, ensuring that modified command files are loaded as the latest version on the next execution.

### 4.3 Session Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max concurrent sessions | 20 | Upper limit on the number of commands being executed simultaneously |
| Max total pages | 50 | Upper limit on the total number of open pages in the browser (commands may internally create additional pages) |
| Command execution timeout | 20 minutes | Can be overridden in test environments via `WEBSCULPT_TEST_COMMAND_TIMEOUT_MS` |

When limits are reached, the daemon does not queue requests but returns errors directly:

- Concurrent sessions full -> `DAEMON_BUSY`
- Total pages full -> `DAEMON_PAGE_LIMIT`

---

## 5. Resource Management and Monitoring

### 5.1 Memory Monitoring

Three-tier memory threshold (monitored object is daemon process RSS):

| Level | Threshold | Behavior |
|-------|-----------|----------|
| Warning | 400 MB | Marked as degraded and a warning log is recorded; does not affect request processing, only reflected in the health endpoint |
| Limit | 600 MB | Marked as restartPending, enters drain mode (rejects new requests, closes after existing sessions complete) |
| Emergency | 1000 MB | Cleans up the status file and forces exit to prevent OOM |

Sampling interval is 60 seconds.

### 5.2 Execution Count Threshold

After accumulating 2000 command executions, the daemon is marked as `restartPending`. At this point:

- New requests are rejected and return `DAEMON_RESTARTING`
- Existing executing sessions continue to complete
- When the number of active sessions drops to 0, graceful shutdown is automatically triggered
- The CLI automatically retries after receiving `DAEMON_RESTARTING`, launching a new daemon instance

### 5.3 Metrics and Logs

- **Logs**: Structured events during runtime are written to `daemon.log` in NDJSON format, including start/stop events, request start/end, memory alarms, browser connect/disconnect, etc.
- **Metrics**: When the daemon shuts down, it flushes summary metrics for the current session (start time, uptime, execution count, peak concurrency, peak page count, peak RSS, shutdown reason) to `daemon-metrics.json`.

---

## 6. Error Codes

### Daemon Returns (IPC Response)

| Error Code | Scenario |
|------------|----------|
| `INVALID_PARAMS` | Request parameters missing or malformed |
| `UNKNOWN_METHOD` | Requested IPC method does not exist |
| `PARSE_ERROR` | Received data is not valid JSON |
| `INTERNAL_ERROR` | Internal socket server processing exception |
| `DAEMON_BUSY` | Concurrent session limit reached |
| `DAEMON_PAGE_LIMIT` | Total page limit reached |
| `DAEMON_RESTARTING` | Daemon is in restartPending drain state |
| `COMMAND_TIMEOUT` | Command execution timeout (20 minutes) |
| `BROWSER_ATTACH_REQUIRED` | Need to attach to an existing CDP session |

### Client and Communication Layer

| Error Code | Scenario |
|------------|----------|
| `DAEMON_START_FAILED` | Daemon failed to start |
| `DAEMON_UNREACHABLE` | Daemon is started but unreachable |
| `SOCKET_TIMEOUT` | Client socket request timeout (20 minutes, aligned with command execution timeout) |

---

## 7. CLI-Side Mechanisms

### Cross-Platform Startup

- **Linux/macOS**: Uses `child_process.spawn` with `detached: true` to start the daemon process, and the parent process immediately calls `unref()`.
- **Windows**: Starts the daemon via a temporary VBScript invoking `WScript.Shell.Run`, detaching the daemon from the parent process's Job Object to avoid the shell hanging while waiting for the daemon to exit. The launched node process has no parent-child relationship with the CLI, so the daemon writes its PID to the status file itself for subsequent CLI processes to discover.

### Fault-Tolerance Retry

The client automatically retries once for `DAEMON_UNREACHABLE` and `DAEMON_RESTARTING`. For the unreachable scenario, the client compares the PID in the status file: if it matches the PID recorded when the request was initiated, it sends `SIGTERM` to clean up the zombie process and deletes the status file, then launches a new instance; if the PID has changed, it means another process has already completed the restart, so it skips cleanup and uses the new instance directly.
