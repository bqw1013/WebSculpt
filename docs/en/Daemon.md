# WebSculpt Daemon Technical Documentation

> This document is for developers, describing the architecture design, process model, and resource management strategy of the WebSculpt background daemon process.

---

## 1. Positioning and Responsibilities

The daemon is the CLI's command execution engine, responsible for running user command modules in an existing browser instance through Playwright.

Division of responsibilities between CLI and daemon:

- **CLI**: Command discovery, parsing, and dispatching; on-demand daemon spawning; sending execution requests via IPC.
- **daemon**: Maintains browser CDP connection; creates isolated pages for each command and executes; manages memory, sessions, and logs.

---

## 2. Process Model

### 2.1 Auto-Spawning

When a `playwright-cli` command is first executed, the CLI automatically detects and spawns the daemon via `ensureDaemonClient()`:

1. Read the daemon state file (`daemon.json`) to check for an existing daemon state
2. If the PID is alive and the socket is reachable, reuse the existing instance
3. If it does not exist or is unreachable, acquire a cross-process lock and start a new daemon
4. After the new daemon starts and writes the state file, the CLI establishes an IPC connection

The cross-process lock (`daemon-start.lock`) prevents multiple CLI processes from spawning multiple daemon instances simultaneously.

### 2.2 Lifecycle Management

The daemon provides the following lifecycle interfaces:

- `daemon start`: Manual start
- `daemon stop`: Graceful shutdown (graceful shutdown → poll confirmation → SIGKILL fallback)
- `daemon restart`: Stop then start
- `daemon status`: Query health status
- `daemon logs`: Read recent logs

### 2.3 Graceful Shutdown

When a stop signal is received, the daemon shuts down in the following order:

1. Stop monitoring and flush metrics
2. Clean up state file, close browser and socket
3. Force exit after a 5-second timeout

---

## 3. IPC Protocol

The CLI and daemon communicate via **Unix Domain Socket** (Linux/macOS) or **Windows Named Pipe**, with transmission format **NDJSON** (newline-delimited JSON), split by line to support stream processing of multiple requests/responses.

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
  - Success return: Protocol layer wraps as `{ success: true, data: unknown }`, client unpacks and returns `data`
- `health`: Query daemon health status, no parameters required
- `stop`: Request graceful shutdown, returns `{ shuttingDown: true }`, no parameters required

### 3.4 Health Endpoint Return Structure

```typescript
{
  pid: number;
  uptime: number;           // Seconds since start
  healthy: true;
  degraded: boolean;        // Whether memory exceeds warning threshold
  browser: {
    connected: boolean;     // Whether CDP connection is established
    lazy: boolean;          // Whether never connected before
    pages: number;          // Current number of open pages
  };
  sessions: {
    active: number;         // Currently executing sessions
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

The daemon internally maintains a single browser CDP connection via browser-manager (`chromium.connectOverCDP("chrome")`), not starting a new browser but connecting to the user's existing Chrome/Edge instance.

The connection has the following fault tolerance mechanisms:

- **Lazy connection**: CDP connection is only established when a command is first executed.
- **Concurrent deduplication**: Multiple simultaneous requests share the same connection attempt, avoiding multiple browser windows popping up.
- **Auto-reconnect**: The `withBrowser` wrapper detects disconnections (`TargetClosedError`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, etc.) and attempts to reconnect once. If the browser is not started, throws `PLAYWRIGHT_CLI_ATTACH_REQUIRED`.

### 4.2 Page Isolation

When each command is executed:

1. Reuse the browser's default context (preserving user login state, cookies, localStorage)
2. Create a new page in that context
3. Load the user command module via dynamic `import()`, execute its default export function in the Node.js process, manipulating the page through the Playwright API
4. Close the page after execution completes

Module loading uses `?t=${Date.now()}` to bypass ESM cache, ensuring the latest version is loaded on next execution after command file modifications.

### 4.3 Session Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max concurrent sessions | 20 | Upper limit of simultaneously executing commands |
| Max total pages | 50 | Upper limit of total open pages in the browser (commands may internally create additional pages) |
| Command execution timeout | 20 minutes | Can be overridden in test environment via `WEBSCULPT_TEST_COMMAND_TIMEOUT_MS` |

When limits are reached, the daemon does not queue but returns errors directly:

- Concurrent sessions full → `DAEMON_BUSY`
- Total pages full → `DAEMON_PAGE_LIMIT`

---

## 5. Resource Management and Monitoring

### 5.1 Memory Monitoring

Three-level memory thresholds (monitored object is daemon process RSS):

| Level | Threshold | Behavior |
|-------|-----------|----------|
| Warning | 400 MB | Marked as degraded and warning log recorded; does not affect request processing, only reflected in health endpoint |
| Limit | 600 MB | Marked as restartPending, enters drain mode (rejects new requests, closes after existing sessions complete) |
| Emergency | 1000 MB | Cleans up state file then force exits to prevent OOM |

Sampling interval is 60 seconds.

### 5.2 Execution Count Threshold

After accumulating 200 command executions, the daemon marks itself as `restartPending`. At this point:

- New requests are rejected and return `DAEMON_RESTARTING`
- Currently executing sessions continue to completion
- When active session count drops to 0, graceful shutdown is automatically triggered
- The CLI automatically retries after receiving `DAEMON_RESTARTING`, spawning a new daemon instance

### 5.3 Metrics and Logs

- **Logs**: Structured events during operation are written to `daemon.log` in NDJSON format, including start/shutdown events, request start/end, memory warnings, browser connect/disconnect, etc.
- **Metrics**: When the daemon shuts down, it flushes summary metrics for this session (start time, uptime, execution count, peak concurrency, peak pages, peak RSS, shutdown reason) to `daemon-metrics.json`.

---

## 6. Error Codes

### Daemon Returns (IPC Response)

| Error Code | Scenario |
|------------|----------|
| `INVALID_PARAMS` | Request parameters missing or malformed |
| `UNKNOWN_METHOD` | Requested IPC method does not exist |
| `PARSE_ERROR` | Received data is not valid JSON |
| `INTERNAL_ERROR` | Socket server internal processing exception |
| `DAEMON_BUSY` | Concurrent session limit reached |
| `DAEMON_PAGE_LIMIT` | Total page limit reached |
| `DAEMON_RESTARTING` | Daemon is in restartPending drain state |
| `COMMAND_TIMEOUT` | Command execution timed out (20 minutes) |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | Need to attach to an existing CDP session |

### Client and Communication Layer

| Error Code | Scenario |
|------------|----------|
| `DAEMON_START_FAILED` | Daemon failed to start |
| `DAEMON_UNREACHABLE` | Daemon started but cannot be connected |
| `SOCKET_TIMEOUT` | Client socket request timed out (60 seconds) |

---

## 7. CLI-Side Mechanisms

### Cross-Platform Launch

- **Linux/macOS**: Uses `child_process.spawn` with `detached: true` to start the daemon process, parent process immediately calls `unref()`.
- **Windows**: Launches daemon via temporary VBScript calling `WScript.Shell.Run`, detaching the daemon from the parent process's Job Object to avoid the shell hanging waiting for the daemon to exit. The resulting node process has no parent-child relationship with the CLI, so the daemon writes its PID to the state file itself for subsequent CLI processes to discover.

### Fault Tolerance Retry

The client automatically retries once for `DAEMON_UNREACHABLE` and `DAEMON_RESTARTING`. For unreachable scenarios, the client compares the PID in the state file: if it matches the PID recorded when the request was initiated, it sends `SIGTERM` to clean up the zombie process and deletes the state file, then spawns a new instance; if the PID has changed, it means another process has already completed the restart, so it skips cleanup and directly uses the new instance.
