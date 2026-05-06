# WebSculpt CLI Command Reference

This document is the reference manual for the WebSculpt CLI, covering the usage, parameters, output contracts, and known limitations of all Meta commands. Extension command authoring specifications are in [`skills/websculpt-en/references/compile/contract.md`](../skills/websculpt-en/references/compile/contract.md).

The WebSculpt CLI is the discovery, execution, and management entry point for commands. It provides the same interface to both human users and AI agents, with core capabilities divided into two categories:

- **Meta commands**: Manage the CLI itself and the command library, such as installing, creating, and uninstalling commands.
- **Extension commands**: Reusable information acquisition workflows that encapsulate the logic of "how to get information from a specific website or API". First precipitated by AI exploration, then directly reused in subsequent tasks without repeatedly consuming tokens.

## 1. Command Classification and Resolution Rules

### 1.1 Classification

| Classification | Location | Description |
|------|------|------|
| **Meta** | Built into system | Manage the CLI itself and the command library, e.g., `config init`, `command list` |
| **Builtin** | `src/cli/builtin/` | Default capabilities or examples distributed with the project |
| **User** | `~/.websculpt/commands/` | Custom workflows precipitated by users or AI in specific tasks; can override builtins |

### 1.2 Lookup Priority

When `websculpt <domain> <action>` is entered, the system resolves in the following priority:

1. **User** — Highest priority, allows overriding builtin commands with the same name
2. **Builtin** — Project built-in default implementations

**Key Rules**:

- Meta commands (`command`, `config`, `daemon`, `skill`) are registered directly at the system level and do not participate in extension command scanning, so they cannot be overridden by User or Builtin.
- User and Builtin conflicts are resolved in favor of User.

## 2. Extension Command Structure

An extension command consists of the following files:

| File | Responsibility | Required |
|------|------|----------|
| `manifest.json` | Metadata: describes command purpose, runtime, parameter list, etc. | Yes |
| `command.js` (or runtime-specific entry) | Execution logic: actual information acquisition code | Yes |
| `README.md` | Caller-facing documentation: parameter descriptions, return values, usage examples | No (warning if missing) |
| `context.md` | Fixer-facing context: precipitation background, reuse value, page structure, failure signals | No (warning if missing) |

**Directory Structure**:

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js
  ├── README.md
  └── context.md
```

Builtin commands physically reside in `src/cli/builtin/<domain>/<action>/`, with the same structure as User commands.

**Invocation Logic**:

When `websculpt <domain> <action>` is entered, the system finds the corresponding command directory by priority, reads `manifest.json` to understand parameters and runtime, then loads the entry file and executes.

**Draft vs. Formal State**:

- `.websculpt-drafts/` is the AI's draft workspace, allowing trial and error. `command draft` generates compliant skeletons here.
- `~/.websculpt/commands/` is the system's formal archive; only commands that pass the `command create` gate (L1-L3 validation) can enter.
- `draft` does not inject `id`/`domain`/`action`; `create` authoritatively injects these three fields using CLI parameters.

**`manifest.json` Key Fields**:

| Field | Type | Description |
|------|------|------|
| `description` | `string` | Command purpose, required and cannot be empty string |
| `runtime` | `string` | `node` (default), `browser`, `shell`, `python` |
| `parameters` | `array` | Parameter list, elements are `{ name, required?, default?, description? }` |
| `prerequisites` | `string[]` | Optional, command-specific prerequisite descriptions |

`id`, `domain`, `action` are system-maintained fields, automatically injected by `command create`, no need to fill during draft phase.

## 3. Output Format and Global Options

### Extension Commands

Execution results are output in JSON format by default, facilitating programmatic and AI consumption; both success and failure contain structured fields (such as `success`, `data`, `error`, `code`, `meta`, etc.).

### Meta Commands

Default output is human-readable text (such as concise lists, status prompts), can be switched to structured JSON via global options:

```bash
websculpt --format json <meta-command>    # or -f json
```

**Exception**: `skill status` only supports human-readable output, no JSON mode.

## 4. Meta Command Reference

### 4.1 `config`

#### `config init`

Initialize the `~/.websculpt` directory structure, including configuration, command library, and log files.

```bash
websculpt config init
```

> **Limitation:** The generated `config.json` is currently only a placeholder; business code has not yet consumed any of its fields.

---

### 4.2 `daemon`

Manage the background browser daemon process. `browser` runtime extension commands are actually executed by this daemon.

#### `daemon status`

Query daemon health and resource status.

```bash
websculpt daemon status
```

**Output Fields**

| Field | Description |
|------|------|
| `pid` | Process ID |
| `uptime` | Uptime in seconds |
| `healthy` | Overall health status |
| `degraded` | Whether in degraded mode (set to true when memory warning or restart threshold reached) |
| `browser.connected` | Whether browser is connected |
| `browser.pages` | Current number of open pages |
| `sessions.active` | Current number of active sessions |
| `sessions.max` | Maximum concurrent sessions |
| `resources.rssMB` | Process RSS memory in MB |

In human mode, currently effective resource limit configuration is also formatted and output.

**Key Behaviors**

- Errors with `DAEMON_NOT_RUNNING` when daemon is not running
- Errors with `DAEMON_UNREACHABLE` when daemon is running but health endpoint is unreachable

---

#### `daemon logs [--lines <n>]`

Display recent entries from the daemon log file.

```bash
websculpt daemon logs [--lines <n>]
```

| Option | Description |
|------|------|
| `--lines <n>` | Number of lines to display, default 50 |

Errors with `NO_LOGS_AVAILABLE` when logs do not exist or cannot be read.

---

#### `daemon start`

Start the background daemon (if not already running).

```bash
websculpt daemon start
```

Returns a prompt when already running and healthy, does not spawn duplicate instances.

---

#### `daemon restart`

Restart the background daemon. Performs graceful stop first, waits 500ms, then starts a new instance to ensure the OS releases socket and other resources.

```bash
websculpt daemon restart
```

---

#### `daemon stop`

Stop the running daemon process.

```bash
websculpt daemon stop
```

**Key Behaviors**

- Sends graceful stop request to daemon and waits for process exit
- If process does not respond, performs force termination and cleans up state files
- Returns "Daemon was not running" when target process does not exist

Returns `DAEMON_STOP_FAILED` on failure (only when process resists force termination).

---

### 4.3 `command`

#### `command list`

List all available extension commands in the current environment, and annotate their source (builtin / user).

```bash
websculpt command list
```

---

#### `command draft`

Generate a compliant command skeleton directory.

```bash
websculpt command draft <domain> <action> [options]
```

| Option | Description |
|------|------|
| `--runtime <rt>` | `node` (default), `browser`, `shell`, `python` |
| `--to <path>` | Output directory (default `.websculpt-drafts/<domain>-<action>/`) |
| `--param <spec>` | Pre-declare parameters (repeatable), e.g., `name:required`, `limit:default=10` |
| `--force` | Override existing draft directory |

**Key Behaviors**

- Reserved domains (`command`, `config`, `skill`) error with `RESERVED_DOMAIN`; target directory already exists and no `--force` errors with `ALREADY_EXISTS`
- Generates `manifest.json` (without `id`/`domain`/`action`), entry file, `README.md`, `context.md`
- `shell`/`python` runtimes will carry `RUNTIME_NOT_EXECUTABLE` warning (not executable)

> **Limitation:** Only outputs deterministic templates, does not perform L1-L3 validation; after modification, call `command validate` if pre-check is needed.

---

#### `command create`

Create a user-defined command from a directory, installing to `~/.websculpt/commands/<domain>/<action>/`.

```bash
websculpt command create <domain> <action> --from-dir <path> [options]
```

| Option | Description |
|------|------|
| `--from-dir <path>` | Source directory path (**required**) |
| `--force` | Override existing command with the same name |

**Key Behaviors**

- Reserved domains error with `RESERVED_DOMAIN`; same-name command without `--force` errors with `ALREADY_EXISTS`
- Uses CLI parameters as authoritative, forcibly overrides/injects manifest `id`/`domain`/`action`
- Executes L1-L3 layered validation, failure prevents disk write; no `--skip-validation` option

> **Limitation:** `shell` and `python` runtimes currently cannot actually execute.

---

#### `command validate`

Pre-check command package compliance, validates only, no disk write.

```bash
websculpt command validate --from-dir <path> [domain] [action]
```

**Key Behaviors**

- **Without `[domain] [action]`**: Validates manifest self-consistency + L2 compliance + L3 contract; missing `id`/`domain`/`action` emits warning (`create` will inject them)
- **With `[domain] [action]`**: Additionally validates the complete state after injection (including consistency), simulating the preview of `create`'s disk write
- Validation failure returns `VALIDATION_ERROR` and details list; pass with warnings returns `success: true` with `warnings`

---

#### `command show`

View the full contract card of an extension command, including metadata, parameters, runtime prerequisites, and asset completeness.

```bash
websculpt command show <domain> <action> [options]
```

| Option | Description |
|------|------|
| `--include-readme` | Append the raw `README.md` from the command directory to the output |

**Output Fields**

| Field | Description |
|------|------|
| `id` / `domain` / `action` | Command identity |
| `description` | Command purpose |
| `runtime` | Execution runtime |
| `source` | Source (`builtin` / `user`) |
| `parameters` | Full parameter contract (including `required`, `default`, `description`) |
| `prerequisites` | Merged prerequisites (system-level + command-level) |

**Key Behaviors**

- Errors with `NOT_FOUND` when command does not exist
- `prerequisites` automatically merges runtime system prerequisites with `manifest.prerequisites`
- `--include-readme` is opt-in: default does not read `README.md`

---

#### `command remove`

Uninstall a user-defined command, deleting the `<domain>/<action>/` directory, and automatically cleaning up the parent directory when the domain is empty.

```bash
websculpt command remove <domain> <action>
```

**Key Behaviors**

- Cannot delete builtin commands (errors with `CANNOT_REMOVE_BUILTIN`)
- Non-existent target command errors with `NOT_FOUND`
- Automatically rebuilds registry index after deletion

---

### 4.4 `skill`

#### `skill install`

Install the built-in WebSculpt skill to the agent directory.

```bash
websculpt skill install [options]
```

| Option | Description |
|------|------|
| `-g, --global` | Install to global agent directory (`~/.claude/skills/websculpt/`, etc.) |
| `-a, --agents <agents>` | Specify target agents, comma-separated (`claude`, `codex`, `agents`, `all`) |
| `--from <path>` | Explicitly specify skill source directory, overriding automatic detection |
| `--lang <lang>` | Language version: `en` (default) or `zh` |
| `--force` | Override existing installation |

**Key Behaviors**

- Default local scope, automatically scans existing agent directories in current directory; errors with `AGENT_DIRS_NOT_FOUND` if none found
- Without `--force`, skips if target already exists (`skipped`)
- Reports results per agent (`installed` / `skipped` / `replaced`)

---

#### `skill uninstall`

Remove the WebSculpt skill from the agent directory.

```bash
websculpt skill uninstall [options]
```

| Option | Description |
|------|------|
| `-g, --global` | Uninstall from global agent directory |
| `-a, --agents <agents>` | Specify target agents |

**Key Behaviors**

- Default local scope
- Reports results per agent (`removed` / `not_found`)
- If all targets report `not_found`, command exits with code 1

---

#### `skill status`

View the skill installation status of each agent.

```bash
websculpt skill status
```

**Key Behaviors**

- Reports installation status per agent (`installed` / `not installed`) and effective scope (`local` / `global`)
- Local installation takes precedence over global; if local exists and global also exists, additionally annotates `[global present]`

## 5. Usage Examples

### 5.1 Invoke a builtin command

```bash
websculpt github list-trending
```

### 5.2 View help

Use `--help` to view global help or help for a specific command.

```bash
websculpt --help
websculpt github --help
websculpt github list-trending --help
```

---

### 5.3 Full lifecycle: from creation to uninstallation

Complete flow from generating skeleton to uninstalling a custom command:

```bash
# 1. Initialize environment (if not already done)
websculpt config init

# 2. Generate skeleton
websculpt command draft mysite fetch --runtime browser --param url:required

# 3. Edit business logic under .websculpt-drafts/mysite-fetch/

# 4. Pre-check compliance
websculpt command validate --from-dir .websculpt-drafts/mysite-fetch/

# 5. Install to command library
websculpt command create mysite fetch --from-dir .websculpt-drafts/mysite-fetch/

# 6. Confirm installed
websculpt command list

# 7. Invoke command
websculpt mysite fetch --url https://example.com

# 8. Uninstall
websculpt command remove mysite fetch
```

## 6. Logging Rules

Extension command execution results are appended to `~/.websculpt/log.jsonl`, Meta commands do not write logs. Currently no automatic cleanup or rotation mechanism.
