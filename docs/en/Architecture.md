# WebSculpt Architecture

> This document is intended for developers. It describes WebSculpt's architecture, runtime model, and directory layout.

---

## 1. Architecture Overview

WebSculpt's core design goal is to turn "information acquisition paths" into locally reusable command assets. The entire system revolves around a three-stage closed loop of **explore → capture → command**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent                                    │
│  (understand requirements, explore paths, capture assets, invoke    │
│   commands)                                                         │
└─────────────────────────────────────────────────────────────────────┘
    │                              │
    ▼                              ▼
┌──────────────┐           ┌──────────────┐
│   explore    │  ──────►  │   capture    │
│  discovery & │  handoff  │  capture &   │
│  validation  │           │  solidify    │
└──────────────┘           └──────────────┘
    ▲                              │
    │                              ▼
    │                      ┌──────────────┐
    └─────────────────────│    command   │
       reuse existing     │  execute &   │
       commands           │  reuse       │
                          └──────────────┘
                                   │
                                   ▼
                          ┌──────────────┐
                          │     CLI      │
                          │  interaction │
                          │  & scheduler │
                          └──────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                ┌──────┐     ┌────────┐     ┌──────────┐
                │ node │     │browser │     │shell/py  │
                └──────┘     │(daemon)│     └──────────┘
                             └────────┘
```

| Stage   | Responsibility | Corresponding Skill | Output |
|---------|---------------|---------------------|--------|
| explore | Complete information acquisition tasks, discover reusable paths; prefer reusing the command library, and use external tools only when necessary | `websculpt-explore` | Exploration results + Capture Assessment |
| capture | Solidify validated paths into command assets, push them through a state machine and hard-gate validation before installation | `websculpt-capture` | Commands installed into the library as `domain/action` |
| command | Discovered, scheduled, and executed by the CLI; users and agents invoke through the same interface | — | Structured JSON output |

The CLI is the unified entry point for all three stages: it provides the `capture` workflow to manage the capture process, the `command` interface to manage the command library, and serves as the execution engine for extension commands.

---

## 2. Explore Stage

### 2.1 Positioning

Explore is the **discovery and validation layer** for information acquisition. Its core responsibilities are:

- **Prefer reuse**: First check whether the command library already contains a captured information acquisition path to avoid wasting tokens.
- **Explore on demand**: When no usable path exists, use external tools to explore and validate new paths, preserving failure signals.
- **Handoff assessment**: When delivering results, evaluate whether the path is worth capturing and hand candidates off to the capture stage.

The explore stage **does not create command assets**; it is only responsible for discovery and assessment.

### 2.2 Skill Deliverables

`skills/websculpt-explore/` contains:

- `SKILL.md`: exploration protocol, library lookup and tool selection rules, trace.md filling specification, explore assess audit requirements.
- `references/access/playwright-cli-guide.md`: operational reference for when the agent needs to directly operate a browser during exploration.

### 2.3 Key Mechanisms

- **Mandatory library check**: Every explore session must begin with `websculpt command list`, and the conclusion must be recorded in the `Library Check` section of `trace.md`.
- **Progressive confirmation**: Candidate commands are confirmed from light to heavy (`--help` → `command show` → `command show --include-readme`).
- **Browser prerequisite check**: If direct browser operation is needed, the agent must first read `playwright-cli-guide.md` and record this in the `Protocol` section of `trace.md`.
- **Assessment structured**: The `## Assessment` section in `trace.md` must contain 8 mandatory H3 subsections (Scenario, Candidate, Runtime, Parameters, Output Schema, Command Library Relation, Prerequisites, Confirmation).
- **CLI hard constraint**: `explore assess` performs L1/L2/L3 three-layer Markdown auditing and H3 subsection integrity checks; entering capture is prohibited before passing.

---

### 2.4 Workspace Structure

The explore workspace is located in the **current project directory**:

```text
.websculpt/
└── explores/
    └── <name>/
        ├── explore.yaml    # metadata + audit results (written on creation, updated on assess)
        └── trace.md        # exploration trace (filled by agent, audited by assess)
```

`explore.yaml` records the workspace identity, exploration intent, and the result of the last `assess` (`status`, `captureEligible`, `candidate`). `trace.md` uses 5 mandatory H2 headings (Library Check / Tool Trace / Protocol / Verified Sources / Assessment), where Assessment must contain 8 H3 subsections when a candidate is proposed.

---

## 3. Capture Stage

### 3.1 Positioning

Capture is a **lightweight workspace** introduced between "explored paths" and "official command assets". After the agent completes exploration, it does not directly write a command to disk; instead, it enters a checked, recoverable, and auditable capture process.

Core responsibilities:

- **Solidify evidence**: `evidence.md` records the explored path, validated URLs, selectors, failure signals, etc.
- **State-machine driven**: The agent does not need to understand the full process; it only needs to loop `capture status` and advance according to the returned `next.action`.
- **Hard-gate installation**: Only after evidence, code, documentation, and validation all pass can `capture finalize` install the command into the library.

### 3.2 Workspace Structure

The workspace is located in the **current project directory**:

```text
.websculpt/
└── captures/
    └── <name>/
        ├── capture.yaml      # machine-readable metadata + command library snapshot (written on creation, read-only thereafter)
        ├── evidence.md       # exploration evidence (filled by agent, audited by system)
        ├── draft/            # command package skeleton
        │   ├── manifest.json
        │   ├── command.js
        │   ├── README.md
        │   └── context.md
        └── validation.json   # result of the most recent validate (includes draft fingerprint)
```

### 3.3 Core Design Concepts

**Six-Artifact Pipeline**

The capture workflow is driven by 6 artifacts in strict layered dependency:

```text
evidence → command → manifest → readme → context → validation
```

Each artifact must wait for its predecessors to reach a completed state before it can leave the blocked state; if a predecessor is rolled back, all downstream artifacts are immediately cascaded back.

**Pure Functional State Machine**

Every call to `capture status` re-reads the filesystem, computes the current state and next action from the scan results, and maintains no in-memory persistent state. This allows the agent to modify files arbitrarily, and an unfamiliar agent in a new session can learn the current progress with a single call.

**Evidence Audit**

`evidence.md` undergoes a three-layer Markdown audit: L1/L2 are hard gates, L3 is a soft rule. This prevents the agent from skipping evidence recording and jumping straight to code.

**Validation Fingerprint**

After validation passes, a SHA256 fingerprint of the draft is computed and written to `validation.json`. Subsequent modifications to the draft invalidate the fingerprint and block finalize, preventing the "validate then secretly change code" bypass.

**Finalize Hard Gate**

Installation requires four conditions simultaneously: successful validation, valid fingerprint, passed evidence audit, and all artifacts completed. When any gate is not met, a clear error code is returned; there is no silent degradation.

> For detailed rules, state transition functions, and decision chains of each mechanism, see [`Capture.md`](./Capture.md).

### 3.4 Skill Deliverables

`skills/websculpt-capture/` contains:

- `SKILL.md`: capture protocol, CaptureSession state machine, 4 test requirement groups, fix-loop rules.
- `references/node-contract.md` / `browser-contract.md`: command authoring contracts by runtime.

---

## 4. Command Stage

### 4.1 Positioning

A command is a reusable information acquisition workflow that encapsulates the logic of "how to get information from a specific website or API". First captured through AI exploration, it is directly reused afterward without repeatedly consuming tokens.

Commands fall into two categories:

- **Builtin (built-in extension commands)**: Located in `src/cli/builtin/`, distributed with the project.
- **User (user-defined commands)**: Located in `~/.websculpt/commands/`, can override builtins, making the system evolvable.

### 4.2 Command Package Structure

```text
~/.websculpt/commands/<domain>/<action>/
  ├── manifest.json    # metadata: description, runtime, parameter list
  ├── command.js       # execution logic (or runtime-specific entry)
  ├── README.md        # documentation for callers
  ├── context.md       # context for maintainers
  └── evidence.md      # exploration evidence (copied from capture path on finalize; not present for path A)
```

Builtin commands physically reside in `src/cli/builtin/<domain>/<action>/`, with the same structure as user commands.

### 4.3 Creation Paths

Extension commands can be created or reconstructed through three paths:

| Path | Command Series | Draft Location | Characteristics |
|------|---------------|----------------|-----------------|
| **A: Direct creation** | `command draft / validate / create` | `.websculpt-drafts/` | Manual authoring or scripted scenarios; full process control |
| **B: Capture workflow** | `capture new / status / validate / finalize` | `.websculpt/captures/<name>/draft/` | Agent-driven, starting from scratch to capture a new command |
| **C: Reverse import** | `capture import / status / validate / finalize` | `.websculpt/captures/<name>/draft/` | Modify or maintain an existing command; copies draft and `evidence.md` from the command library, synthesizing a fingerprint so the workspace starts with all artifacts `done` |

Paths B and C internally call the same installation logic as path A during finalize, but with additional pre-gates such as evidence auditing and draft fingerprint anti-tampering.

### 4.4 Layered Validation

Regardless of path, both `command create` and `capture finalize` enforce L1–L3 layered validation before writing to disk:

| Level | Scope |
|-------|-------|
| L1 Structure | manifest fields and types |
| L2 Compliance | prohibited code patterns |
| L3 Contract | consistency between code structure and manifest |

---

## 5. CLI Layer

### 5.1 Positioning

The CLI is the discovery, management, and lifecycle entry point for commands, offering the same interface to both human users and AI.

- **Meta commands**: Manage the CLI itself and the command library. Includes `command`, `config`, `daemon`, `explore`, `scope`, `skill`, `capture`.
- **Extension commands**: Reusable information acquisition workflows. Meta commands cannot be overridden, preventing extension commands from breaking core management capabilities.

### 5.2 Lookup Priority

When `websculpt <domain> <action>` is entered:

1. **User** — highest priority, allows overriding a builtin with the same name
2. **Builtin** — project built-in default implementation

Meta commands are registered at the system level and do not participate in extension command scanning.

### 5.3 Skill Management

The CLI provides `skill install / uninstall / status` meta commands to install project built-in skills into each agent's directory (`.claude/skills/`, `.codex/skills/`, `.agents/skills/`, etc.).

- Defaults to local scope, automatically scanning existing agent directories in the current directory.
- Supports `--global` installation to global agent directories.
- Supports `--lang en/zh` to switch language versions.

---

## 6. Runtimes and Execution Backends

WebSculpt currently supports four runtimes:

| Runtime | Execution Method | Status |
|---------|-----------------|--------|
| **`node`** | CLI process dynamically imports the command module and executes it in the same process | Fully available |
| **`browser`** | Executed by WebSculpt's self-hosted background daemon process; CLI forwards tasks via IPC | Fully available |
| **`shell`** | Command package lifecycle (draft, validate, create) is supported; CLI execution engine not yet connected | Creation/validation only |
| **`python`** | Same as above | Creation/validation only |

> **Note**: `browser` here is a **runtime name**, indicating the command requires a browser environment. It is architecturally completely independent from the `@playwright/cli` npm package (the CLI tool used by the agent during the exploration stage). The daemon internally uses `playwright-core` to connect to the browser and does not depend on the process or session management of the `@playwright/cli` package.

The daemon centrally manages browser resources, responsible for memory monitoring, automatic restart triggered by execution count thresholds, and metrics and log persistence. See [`Daemon.md`](./Daemon.md) for details.

---

## 7. Directory Layout

### 7.1 Project Directory

```
WebSculpt/
├── src/
│   ├── cli/                    # entry, engine, meta commands, built-in commands, validators
│   │   ├── engine/             # command discovery and execution scheduling
│   │   ├── meta/               # meta command implementations and shared logic
│   │   │   ├── capture/        # capture workflow
│   │   │   ├── command/        # command management
│   │   │   ├── explore/        # explore workflow
│   │   │   └── lib/            # meta command shared logic
│   │   ├── builtin/            # built-in extension commands
│   │   ├── runtime/            # runtime normalization
│   │   └── types/              # CLI internal types
│   ├── daemon/                 # background browser execution process
│   │   ├── client/             # IPC client, lifecycle management, state persistence
│   │   ├── server/             # browser management and task execution backend
│   │   └── shared/             # protocol definitions and cross-process shared paths
│   ├── types/                  # cross-layer shared TypeScript type definitions
│   └── infra/                  # infrastructure utilities: user directory paths, config and log I/O
├── skills/                     # agent skill deliverables
│   ├── websculpt-explore/      # explore stage skill (includes access references)
│   └── websculpt-capture/      # capture stage skill (includes authoring contracts)
├── openspec/                   # OpenSpec change management
├── tests/                      # test suite (CLI engine, meta commands, and daemon)
│   ├── e2e/
│   ├── integration/
│   └── unit/
├── docs/                       # documentation
└── dist/                       # build output
```

### 7.2 Project-level Workspace Directory

WebSculpt maintains `.websculpt/` in the current project root for project-related local data:

```text
./.websculpt/
├── scope.json         # project-level command visibility whitelist
├── explores/          # explore workspaces
└── captures/          # capture workspaces
```

For detailed structure of explore and capture workspaces, see §2.4 and §3.2.

---

### 7.3 User Directory

```
~/.websculpt/
├── commands/                # user-defined extension commands
├── config.json              # user configuration
├── log.jsonl                # extension command execution logs
├── audit.jsonl              # command installation/override audit logs
├── registry-index.json      # persisted registry index (command manifest cache)
├── daemon.json              # daemon process state (PID, socket path)
├── daemon.log               # daemon runtime logs
└── daemon-metrics.json      # daemon session summary metrics
```
