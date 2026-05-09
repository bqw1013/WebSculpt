# WebSculpt CLI Command Reference

This document is the reference manual for the WebSculpt CLI, covering the usage, parameters, output contracts, and known limitations of all Meta commands. For the extension command authoring spec, see the documentation under `skills/websculpt-capture`.

WebSculpt CLI is the entry point for command discovery, execution, and management. It provides the same interface for both human users and AI agents. Core capabilities fall into two categories:

- **Meta commands**: Manage the CLI itself and the command library, such as installing, creating, and uninstalling commands.
- **Extension commands**: Reusable information-retrieval workflows that encapsulate the logic of "how to fetch information from a specific website or API." First explored and captured by AI, they can be reused directly afterwards without repeatedly consuming tokens.

## 1. Command Classification and Resolution Rules

### 1.1 Classification

| Classification | Location | Description |
|------|------|------|
| **Meta** | Built into the system | Manage the CLI itself and the command library, e.g. `config init`, `command list` |
| **Builtin** | `src/cli/builtin/` | Default capabilities or examples distributed with the project |
| **User** | `~/.websculpt/commands/` | Custom workflows captured by users or AI during specific tasks; can override builtin |

### 1.2 Lookup Priority

When `websculpt <domain> <action>` is entered, the system resolves it in the following priority:

1. **User** — highest priority, allows overriding builtin commands with the same name
2. **Builtin** — default implementation built into the project

**Key rules**:

- Meta commands (`capture`, `command`, `config`, `daemon`, `skill`) are registered at the system level and do not participate in extension command scanning, so they cannot be overridden by User or Builtin commands.
- Conflicts between User and Builtin are resolved in favor of User.

## 2. Extension Command Structure

An extension command consists of the following files:

| File | Responsibility | Required |
|------|------|----------|
| `manifest.json` | Metadata: describes command purpose, runtime, parameter list, etc. | Yes |
| `command.js` (or runtime-specific entry) | Execution logic: actual information-retrieval code | Yes |
| `README.md` | Caller-facing documentation: parameter descriptions, return values, usage examples | No (warning if missing) |
| `context.md` | Fixer-facing context: background, reuse value, page structure, failure signals | No (warning if missing) |
| `evidence.md` | Exploration evidence: verified URLs, selectors, failure signals, etc. (copied on capture path finalize) | No (not present on path A) |

**Directory structure**:

```
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json
  ├── command.js
  ├── README.md
  ├── context.md
  └── evidence.md
```

Builtin commands are physically located at `src/cli/builtin/<domain>/<action>/`, with the same structure as User commands.

**Invocation logic**:

When `websculpt <domain> <action>` is entered, the system finds the corresponding command directory according to priority, reads `manifest.json` to understand parameters and runtime, then loads the entry file for execution.

**Creation paths**

Extension commands can be created through two paths:

| Path | Command series | Draft location | Characteristics |
|------|---------|---------|------|
| **A: Direct creation** | `command draft / validate / create` | `.websculpt-drafts/` | Manual authoring or scripted scenarios; full control over the workflow |
| **B: Capture workflow** | `capture new / status / validate / finalize` | `.websculpt-captures/<name>/draft/` | Agent-driven; additionally requires `evidence.md` and state machine progression; reuses `command` validation and installation underneath, adding evidence auditing and draft fingerprint tamper-proofing |

`~/.websculpt/commands/` is the system's formal archive; only commands that pass validation can enter it. The `manifest.json` in the draft stage does not inject `id`/`domain`/`action`; during installation, CLI parameters are authoritative and forcibly injected.

**`manifest.json` key fields**:

| Field | Type | Description |
|------|------|------|
| `description` | `string` | Command purpose, required and cannot be an empty string |
| `runtime` | `string` | `node` (default), `browser`, `shell`, `python` |
| `parameters` | `array` | Parameter list, elements are `{ name, required?, default?, description? }` |
| `prerequisites` | `string[]` | Optional, command-specific prerequisite descriptions |
| `requiresBrowser` | `boolean` | Whether a browser environment is required; must be `true` for `browser` runtime, must be `false` for other runtimes |
| `authRequired` | `string` | Optional, whether the command requires login/authentication: `"required"`, `"not-required"`, `"unknown"` (default) |

`id`, `domain`, and `action` are system-maintained fields, automatically injected by `command create`, and do not need to be filled in during the draft stage. `requiresBrowser` is automatically derived by `command draft` and `capture new` based on the selected runtime, and usually does not need to be manually modified.

## 3. Output Format and Global Options

### Extension commands

Execution results are output in JSON by default, facilitating programmatic and AI consumption; both success and failure include structured fields (such as `success`, `data`, `error`, `code`, `meta`, etc.).

### Meta commands

Default output is human-readable text (such as concise lists, status prompts), and can be switched to structured JSON via global options:

```bash
websculpt --format json <meta-command>    # or -f json
```

## 4. Meta Command Reference

### 4.1 `config`

#### `config init`

Initialize the `~/.websculpt` directory structure, including configuration, command library, and log files.

```bash
websculpt config init
```

> **Limitation:** The generated `config.json` is currently only a placeholder; business code does not consume any fields from it.

---

### 4.2 `daemon`

Manage the background browser daemon process. Extension commands with `browser` runtime are actually executed by this daemon.

#### `daemon status`

Query daemon health and resource status.

```bash
websculpt daemon status
```

**Output fields**

| Field | Description |
|------|------|
| `pid` | Process ID |
| `uptime` | Uptime in seconds |
| `healthy` | Overall health status |
| `degraded` | Whether in degraded mode (set to true on memory warning or when restart threshold is reached) |
| `browser.connected` | Whether the browser is connected |
| `browser.pages` | Current number of open tabs |
| `sessions.active` | Current number of active sessions |
| `sessions.max` | Maximum concurrent sessions |
| `resources.rssMB` | Process RSS memory in MB |

In human mode, the currently effective resource limit configuration is also formatted and printed.

**Key behaviors**

- Returns error `DAEMON_NOT_RUNNING` when the daemon is not running
- Returns error `DAEMON_UNREACHABLE` when the daemon is running but the health endpoint is unreachable

---

#### `daemon logs [--lines <n>]`

Display recent entries from the daemon log file.

```bash
websculpt daemon logs [--lines <n>]
```

| Option | Description |
|------|------|
| `--lines <n>` | Number of lines to display, default 50 |

Returns error `NO_LOGS_AVAILABLE` when the log does not exist or cannot be read.

---

#### `daemon start`

Start the background daemon (if not already running).

```bash
websculpt daemon start
```

Returns a prompt when already running and healthy; does not start duplicate instances.

---

#### `daemon restart`

Restart the background daemon. Performs a graceful stop first, waits 500ms, then starts a new instance to ensure the OS releases sockets and other resources.

```bash
websculpt daemon restart
```

---

#### `daemon stop`

Stop the running daemon process.

```bash
websculpt daemon stop
```

**Key behaviors**

- Sends a graceful stop request to the daemon and waits for the process to exit
- If the process does not respond, performs a force kill and cleans up state files
- Returns "Daemon was not running" when the target process does not exist

Returns `DAEMON_STOP_FAILED` on failure (only when the process resists force termination).

---

### 4.3 `command`

#### `command list`

List all available extension commands in the current environment, annotated with source (builtin / user).

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
| `--param <spec>` | Pre-declare parameters (repeatable), e.g. `name:required`, `limit:default=10` |
| `--force` | Overwrite existing draft directory |

**Key behaviors**

- Reserved domains (`command`, `config`, `skill`) return error `RESERVED_DOMAIN`; target directory already exists without `--force` returns error `ALREADY_EXISTS`
- Generates `manifest.json` (without `id`/`domain`/`action`), entry file, `README.md`, `context.md`
- `shell`/`python` runtimes trigger `RUNTIME_NOT_EXECUTABLE` warning (not executable)

> **Limitation:** Only outputs deterministic templates; does not perform L1-L3 validation; call `command validate` for pre-flight checks after modification.

---

#### `command create`

Create a user-defined command from a directory and install it to `~/.websculpt/commands/<domain>/<action>/`.

```bash
websculpt command create <domain> <action> --from-dir <path> [options]
```

| Option | Description |
|------|------|
| `--from-dir <path>` | Source directory path (**required**) |
| `--force` | Overwrite existing command with the same name |

**Key behaviors**

- Reserved domains return error `RESERVED_DOMAIN`; existing command without `--force` returns error `ALREADY_EXISTS`
- Uses CLI parameters as authoritative, forcibly overwrites/injects manifest `id`/`domain`/`action`
- Performs L1-L3 layered validation; failure prevents disk write; no `--skip-validation` option

> **Limitation:** `shell` and `python` runtimes currently cannot be actually executed.

---

#### `command validate`

Pre-flight check of command package compliance; validates only, does not write to disk.

```bash
websculpt command validate --from-dir <path> [domain] [action]
```

**Key behaviors**

- **Without `[domain] [action]`**: validates manifest self-consistency + L2 compliance + L3 contract; warns when `id`/`domain`/`action` are missing (`create` will inject them)
- **With `[domain] [action]`**: additionally validates the complete state after injection (including consistency), simulating the disk-write preview of `create`
- Validation failure returns `VALIDATION_ERROR` and a details list; passing with warnings returns `success: true` with `warnings`

---

#### `command show`

View the full contract card for an extension command, including metadata, parameters, runtime prerequisites, and asset integrity.

```bash
websculpt command show <domain> <action> [options]
```

| Option | Description |
|------|------|
| `--include-readme` | Append the raw `README.md` from the command directory to the output |

**Output fields**

| Field | Description |
|------|------|
| `id` / `domain` / `action` | Command identity |
| `description` | Command purpose |
| `runtime` | Execution runtime |
| `source` | Source (`builtin` / `user`) |
| `parameters` | Full parameter contract (including `required`, `default`, `description`) |
| `prerequisites` | Merged prerequisites (system-level + command-level) |

**Key behaviors**

- Returns error `NOT_FOUND` when the command does not exist
- `prerequisites` automatically merges runtime system prerequisites with `manifest.prerequisites`
- `--include-readme` is opt-in: `README.md` is not read by default

---

#### `command remove`

Uninstall a user-defined command, deleting the `<domain>/<action>/` directory, and automatically cleaning up the parent directory when the domain is empty.

```bash
websculpt command remove <domain> <action>
```

**Key behaviors**

- Cannot delete builtin commands (returns error `CANNOT_REMOVE_BUILTIN`)
- Returns error `NOT_FOUND` when the target command does not exist
- Rebuilds the registry index after deletion

---

### 4.4 `capture`

Manage the command capture workspace, converting verified information-retrieval paths into reusable extension commands.

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime> [--force]
websculpt capture status <name>
websculpt capture validate <name>
websculpt capture finalize <name> [--force]
```

| Subcommand | Purpose |
|--------|------|
| `new` | Create workspace, generate `capture.yaml`, `evidence.md`, and `draft/` skeleton |
| `status` | Query workspace status, returning completion of 6 artifacts, `readyToFinalize`, and `next.action` |
| `validate` | Pre-flight check draft compliance; writes `validation.json` with fingerprint on success |
| `finalize` | Install into the command library; only executable when `status` returns `readyToFinalize: true` |

**Options**

| Option | Description |
|------|------|
| `--domain <domain>` | Required for `new`, target command domain |
| `--action <action>` | Required for `new`, target command action |
| `--runtime <runtime>` | Required for `new`, `node` / `browser` / `shell` / `python` |
| `--force` | For `new`, overwrite existing workspace; for `finalize`, overwrite existing user command |

For detailed state machine and validation logic, see [`Capture.md`](./Capture.md).

---

### 4.5 `skill`

#### `skill install`

Install built-in WebSculpt skills into agent directories.

```bash
websculpt skill install [name] [options]
```

| Parameter | Description |
|------|------|
| `name` | Optional, specify a single skill name (e.g. `capture`, `explore`); omit to install all built-in skills |

| Option | Description |
|------|------|
| `-g, --global` | Install to the global agent directory |
| `-a, --agents <agents>` | Specify target agents, comma-separated (`claude`, `codex`, `agents`, `all`) |
| `--from <path>` | Explicitly specify the skill source directory, overriding automatic detection |
| `--lang <lang>` | Language version: `en` (default) or `zh` |
| `--force` | Overwrite existing installation |

**Key behaviors**

- Default local scope; automatically scans for existing agent directories under the current directory; returns error `AGENT_DIRS_NOT_FOUND` if none exist
- Without `--force`, skips if the target already exists (`skipped`)
- Reports results per agent + skill (`installed` / `skipped` / `replaced`)

---

#### `skill uninstall`

Remove WebSculpt skills from agent directories.

```bash
websculpt skill uninstall [name] [options]
```

| Parameter | Description |
|------|------|
| `name` | Optional, specify a single skill name (e.g. `capture`, `explore`); omit to remove all `websculpt-*` skills |

| Option | Description |
|------|------|
| `-g, --global` | Uninstall from the global agent directory |
| `-a, --agents <agents>` | Specify target agents |

**Key behaviors**

- Default local scope
- Reports results per agent + skill (`removed` / `not_found`)
- Exits with code 1 if all targets report `not_found`

---

#### `skill status`

View the skill installation status of each agent.

```bash
websculpt skill status
```

**Key behaviors**

- Groups by agent, reports installation status per skill (`installed` / `not installed`) and effective scope (`local` / `global`)
- Local installation takes precedence over global

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

### 5.3 Creating an extension command: two paths compared

Using the creation of the `mysite fetch` command as an example. Both paths ultimately install to `~/.websculpt/commands/mysite/fetch/`, with an identical command package structure.

**Path A: Direct creation (`command` series)**

Suitable for manual authoring or scenarios with clear requirements.

```bash
# 1. Generate skeleton
websculpt command draft mysite fetch --runtime browser --param url:required

# 2. Edit business logic under .websculpt-drafts/mysite-fetch/

# 3. Pre-flight check and install
websculpt command validate --from-dir .websculpt-drafts/mysite-fetch/ mysite fetch
websculpt command create mysite fetch --from-dir .websculpt-drafts/mysite-fetch/
```

**Path B: Capture workflow (`capture` series)**

Suitable for agent-driven workflows, requiring recorded exploration evidence and step-by-step progression through a state machine.

```bash
# 1. Create workspace
websculpt capture new mysite-fetch --domain mysite --action fetch --runtime browser

# 2. Status-driven loop: proceed step by step according to next.action returned by capture status
websculpt capture status mysite-fetch   # → fill-evidence
# Edit evidence.md
websculpt capture status mysite-fetch   # → fill-command
# Edit draft/command.js
# ... continue according to status until validate

# 3. Validate and install
websculpt capture validate mysite-fetch
websculpt capture finalize mysite-fetch
```

### 5.4 Invoke and uninstall

```bash
# Invoke
websculpt mysite fetch --url https://example.com

# View all installed commands
websculpt command list

# Uninstall
websculpt command remove mysite fetch
```

## 6. Logging Rules

Extension command execution results are appended to `~/.websculpt/log.jsonl`; Meta commands are not logged. There is currently no automatic cleanup or rotation mechanism.
