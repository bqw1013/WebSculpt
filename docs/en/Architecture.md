# WebSculpt Architecture Deep Dive

> This document is for developers, describing WebSculpt's architecture design, runtime model, and directory planning.

---

## 1. Architecture Overview

WebSculpt consists of four layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent                                    │
│  (reads docs, makes decisions, writes code, invokes CLI)            │
└─────────────────────────────────────────────────────────────────────┘
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────┐      ┌──────────────┐      ┌──────────────┐
│ access  │      │   explore    │      │   compile    │
│Constraint│      │  Strategy    │      │  Spec Layer  │
└─────────┘      └──────────────┘      └──────────────┘
    │                                         │
    └─────────────────────┬───────────────────┘
                          ▼
                   ┌──────────────┐
                   │     CLI      │
                   │Interaction & │
                   │Execution Layer│
                   └──────────────┘
```

| Layer | Purpose | Consumer |
|------|------|--------|
| access | Write `guide.md` for each external tool to constrain the Agent's usage boundaries | AI |
| explore | Write `strategy.md` to guide multi-tool coordination and reuse of existing commands | AI |
| compile | Write `contract.md` to define command authoring specifications and validation rules | AI / CLI |
| CLI | Provide command registration, discovery, execution, and lifecycle management | Human users / AI |

The following sections elaborate on each layer in order.

---

## 2. access

### 2.1 Positioning

The access layer provides a `guide.md` for each external tool, clarifying connection methods, available commands, and risk warnings, constraining the Agent to operate within controlled boundaries.

The access layer does not replace the tool itself, nor does it make routing decisions or orchestrate operations. It only provides reference documentation on "how to use this tool and what its limitations are"; specific usage decisions are left to the explore layer and the Agent itself.

### 2.2 Directory Structure

```
skills/websculpt/references/access/
  <tool-name>/
    guide.md             # Tool operation reference
```

The English version is located at `skills/websculpt-en/references/access/`.

---

## 3. explore

### 3.1 Positioning

The explore layer provides orchestration strategies for multi-tool coordination, guiding the Agent on how to combine tools to accomplish complex tasks. As the command library accumulates, the Agent can directly reuse existing builtin or user commands to retrieve information, reducing redundant token consumption.

Exploration results are validated by compile and then persisted as new commands via `command create`, forming a closed loop of "explore → precipitate → reuse". The output of the explore layer is AI-facing decision reference documentation (`strategy.md`), not executable code.

### 3.2 Directory Structure

```
skills/websculpt/references/explore/
  strategy.md          # Exploration strategy documentation
```

The English version is located at `skills/websculpt-en/references/explore/`.

---

## 4. compile

### 4.1 Positioning

The compile layer defines the authoring specifications for extension commands. Unlike access and explore, compile's specifications do not have an independent CLI; they are enforced through CLI commands `command draft`, `command validate`, and `command create`.

Runtime contracts and authoring specifications are in [`skills/websculpt-en/references/compile/contract.md`](../skills/websculpt-en/references/compile/contract.md).

### 4.2 Key Design Decisions

- **Structure enforced, logic free**: Metadata such as manifest format and export signatures are hard constraints of the system; the specific implementation inside commands is written by AI based on exploration results.

- **Validation is a hard gate**: `command create` enforces L1-L3 layered validation before writing to disk; failures unconditionally prevent writing.

  | Level | Scope |
  |------|------|
  | L1 Structure | Manifest fields and types |
  | L2 Compliance | Prohibited code patterns |
  | L3 Contract | Consistency between code structure and manifest |

---

## 5. CLI

### 5.1 Positioning

The CLI is the entry point for command discovery, management, and lifecycle, providing the same interface to both human users and AI:

- **Meta commands**: Manage the CLI itself and the command library, such as `command`, `config`, `skill`, `daemon`.
- **Extension commands**: Reusable information acquisition workflows, divided into Builtin (project defaults) and User (user-defined). User can override Builtin, making the system evolvable; Meta cannot be overridden, preventing extension commands from breaking core management capabilities.

### 5.2 Command Lifecycle

The design division between `command draft` and `command create` is based on one principle: **draft state allows trial and error, formal state enforces compliance**.

- `draft` generates compliant skeletons, does not validate, does not write to disk, letting the Agent focus on business logic.
- `validate` is a pre-check gate, read-only.
- `create` is the only legitimate entry point, executing L1-L3 hard-gate validation before writing to disk.

---

## 6. Runtimes and Execution Backends

WebSculpt currently supports two execution paths:

- **`node`**: The CLI process dynamically imports the command module and executes it within the same process.
- **`playwright-cli`**: Executed by a background daemon process; the CLI forwards tasks via IPC. The daemon is automatically spawned on first invocation, and can also be manually managed through the `daemon` meta command.

The daemon centrally manages browser resources, handling memory monitoring, automatic restart triggered by execution count thresholds, metrics, and log persistence.

`shell` and `python` have completed command package lifecycle support (`draft`, `validate`, `create` can all generate and validate), but the CLI execution engine has not yet been integrated.

---

## 7. Directory Planning

### 7.1 Project Directory

```
WebSculpt/
├── src/
│   ├── cli/                    # Entry points, engine, Meta commands, builtins, validators
│   │   ├── engine/             # Command discovery and execution scheduling
│   │   ├── meta/               # Meta command implementations and shared logic
│   │   ├── builtin/            # Built-in extension commands
│   │   └── runtime/            # Runtime normalization
│   ├── daemon/                 # Background browser execution process
│   │   ├── client/             # IPC client, lifecycle management, state persistence
│   │   ├── server/             # Browser management and task execution backend
│   │   └── shared/             # Protocol definitions and cross-process shared paths
│   ├── types/                  # Cross-layer shared TypeScript type definitions
│   └── infra/                  # Infrastructure utilities: user directory paths, config and log I/O
├── skills/websculpt/           # Agent skill deliverables
├── tests/                      # Test suites (CLI engine, Meta commands, and daemon)
└── dist/                       # Build output
```

### 7.2 User Directory

```
~/.websculpt/
├── commands/                # User-defined extension commands
├── config.json              # User configuration
├── log.jsonl                # Extension command execution logs
├── audit.jsonl              # Command installation/override audit logs
├── registry-index.json      # Persistent registry index (command manifest cache)
├── daemon.json              # Daemon process state (PID, socket path)
└── daemon.log               # Daemon runtime logs
```
