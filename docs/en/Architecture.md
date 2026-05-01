# WebSculpt Architecture Deep Dive

> This document is for developers and agents. It answers "how the system is organized, the boundaries of each layer, how they interact, and where the code lives". It is the technical expansion of [Design.md](Design.md).

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

| Layer | Essence | Consumer |
|------|------|--------|
| access | Tool encapsulation and behavioral constraints | AI / CLI runner |
| explore | Multi-tool coordination strategies | AI |
| compile | Command asset authoring specifications and validation | AI (spec) / CLI (validator) |
| CLI | Interactive interface of the experience precipitation framework | Human users / AI |

---

## 2. access — Tool Encapsulation and Constraint Layer

### 2.1 Positioning

The access layer not only ensures tools are ready, but more importantly **constrains how agents use tools**. Powerful tools like the Playwright CLI, if agents directly call all their low-level APIs, will lead to unpredictable behavior. The access layer provides a `guide.md` for each tool, clarifying connection methods, available commands, and risk warnings, allowing agents to operate within controlled boundaries.

The access layer explicitly stays out of the following areas:

- Does not predefine operation APIs (e.g., `browser.click()`) — unless scenario-specific code-layer constraints are needed
- Does not make routing decisions ("which tool should be used for this task")
- Does not orchestrate operation sequences

### 2.2 Directory Structure

Current actual state:

```
skills/websculpt/references/access/
  playwright-cli/
    guide.md             # Playwright CLI operation reference
```

The English version is located at `skills/websculpt-en/references/access/`.

Minimum requirements for each tool subdirectory:

```
skills/websculpt/references/access/<tool-name>/
  guide.md             # Required: connection method, available commands, risk warnings
  ...                  # Tool-specific reference documentation
```

When adding a new tool, create a subdirectory under `skills/websculpt/references/access/<tool-name>/` containing at least `guide.md`.

---

## 3. explore — Multi-tool Coordination Strategy Layer

### 3.1 Positioning

The explore layer not only guides "which tool to choose", but more importantly guides "**how to combine multiple tools to accomplish complex tasks**". For example: first use `fetch` to probe page structure, if anti-crawling is encountered switch to browser automation, and after information acquisition use local tools for data cleaning — this is a multi-tool coordinated pipeline, and the explore layer should provide such orchestration strategies.

The explore layer is not a code layer; it does not produce machine-consumable structured logs. Its output is decision reference documentation for AI.

### 3.2 Directory Structure

```
skills/websculpt/references/explore/
  strategy.md          # Exploration strategy documentation
```

The English version is located at `skills/websculpt-en/references/explore/`.

For specific strategies on tool selection, human-AI collaboration, and the connection between exploration and precipitation, see `src/explore/strategy.md`.

---

## 4. compile — Specification and Validation Layer

### 4.1 Positioning

The compile layer defines the authoring specifications for command assets.

Like access and explore, its core output is **AI-facing specification documentation**, not executable code.

Runtime contracts and authoring specifications are in [`skills/websculpt-en/references/compile/contract.md`](../skills/websculpt-en/references/compile/contract.md); L1-L3 validation is implemented in `src/cli/meta/command-validation.ts`.

### 4.2 Key Design Decisions

- **No independent CLI exposure**: No `websculpt compile` command.

- **"Structure enforced, logic free"**:
  - **Structure enforced**: Manifest format, export signatures, parameter declaration methods, prohibitions, etc. are hard constraints of the system
  - **Logic free**: The specific implementation inside commands is written by AI based on exploration results

- **Minimal runnable skeleton**: `command draft` generates a minimal runnable skeleton that includes the runtime signature and parameter parsing (e.g., `export default async function(params)`), preventing AI from writing boilerplate from scratch while not constraining how business logic is implemented.

- **AI-driven testing**: The system does not provide an automated testing framework for command assets. After command creation, AI calls `websculpt <domain> <action>` on its own to verify. WebSculpt CLI itself has a complete test suite (see `tests/`), but test coverage is limited to the CLI engine and Meta commands, not the business logic of extension commands.

### 4.3 Validation System

L1-L3 layered validation is executed before `command create` writes to disk:

| Level | Scope | Implementation Location |
|------|------|----------|
| L1 Structure | Manifest fields, types, consistency | `src/cli/meta/command-validation.ts` |
| L2 Compliance | Prohibited code patterns (static analysis) | `src/cli/meta/command-validation.ts` |
| L3 Contract | Code structure consistency with manifest | `src/cli/meta/command-validation.ts` |

**Design Decision: Validation is a hard gate**

L1-L3 validation failures unconditionally prevent writing to disk, even when using `--force` to override existing commands.

---

## 5. CLI — Interaction Layer of the Experience Precipitation Framework

### 5.1 Positioning

The CLI is not just the discovery, execution, and management entry point for commands, but also the system where agents **precipitate experience explored from past tasks into reusable code**, and in subsequent tasks **constrain themselves to use this precipitated code**. It is the agent's "external memory + behavioral constraint layer", where human users and AI share the same command library interface.

### 5.2 Command Classification Design Decisions

- **User overrides Builtin**: Commands precipitated by users or AI can override project defaults, making the system evolvable.
- **Meta is non-overridable**: Reserved domains (e.g., `command`, `config`) are managed by the CLI itself, preventing extension commands from breaking core management capabilities.
- **Registry Index caching**: The CLI loads the manifest from `~/.websculpt/registry-index.json` at startup, rather than scanning the directory tree in real time, to accelerate cold start; the Index is automatically rebuilt after command changes.

For specific classification definitions and resolution rules, see [CLI Command Reference](CLI.md#1-command-categorization-and-resolution-rules).

### 5.3 Self-healing Closure and Precipitation Triggers

When a command fails, the system does not automatically repair, but triggers an AI-led self-healing process: re-exploration, code fix, compile validation, and re-write to disk via `command create`. The complete proposal interaction flow, format specification, and automatic trigger mechanism are not yet implemented.

### 5.4 Responsibility Boundaries in Command Lifecycle

The design division between `command draft` and `command create` is based on one principle: **draft state allows trial and error, formal state enforces compliance**.

- `draft` generates compliant skeletons, does not validate, does not inject identity fields, letting agents focus on business logic.
- `validate` is a pre-check gate, read-only, no disk writes.
- `create` is the only legitimate entry point, executing hard-gate validation, identity injection, and conflict arbitration.

For specific behavior, see [CLI Command Reference](CLI.md).

---

## 6. Runtimes

WebSculpt currently supports full execution for `node` and `playwright-cli` runtimes. `shell` and `python` have completed command package lifecycle support (`draft`, `validate`, `create` can all generate and validate), but the CLI execution engine has not yet been integrated.

---

## 7. Directory Planning

### 7.1 Project Directory

```
WebSculpt/
├── src/
│   ├── cli/             # Entry points, engine, Meta commands, builtins, validators
│   ├── types/           # Cross-layer shared TypeScript type definitions
│   └── infra/           # Infrastructure utilities: user directory paths, config/log I/O
├── skills/websculpt/    # Agent skill deliverables (includes access, explore, compile reference docs)
├── tests/               # Test suites (CLI engine and Meta commands)
└── dist/                # Build output
```

`types/` and `infra/` do not belong to the four-layer business model, but are supporting infrastructure: `types/` provides cross-layer shared type contracts; `infra/` provides user directory path constants (`paths.ts`) and config/log persistence interfaces (`store.ts`), consumed by the CLI layer.

### 7.2 User Directory

```
~/.websculpt/
├── commands/                # User-defined extension commands
├── config.json              # User configuration
├── log.jsonl                # Extension command execution logs
├── audit.jsonl              # Command installation/override audit logs
└── registry-index.json      # Persistent registry index (command manifest cache)
```
