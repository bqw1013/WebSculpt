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
src/access/
  playwright-cli/
    guide.md             # Playwright CLI operation reference
```

Minimum requirements for each tool subdirectory:

```
src/access/<tool-name>/
  guide.md             # Required: connection method, available commands, risk warnings
  index.ts             # Optional: tool-specific additional entry point
  ...                  # Tool-specific implementation files
```

When adding a new tool, create a subdirectory under `src/access/<tool-name>/` containing at least `guide.md`.

---

## 3. explore — Multi-tool Coordination Strategy Layer

### 3.1 Positioning

The explore layer not only guides "which tool to choose", but more importantly guides "**how to combine multiple tools to accomplish complex tasks**". For example: first use `fetch` to probe page structure, if anti-crawling is encountered switch to browser automation, and after information acquisition use local tools for data cleaning — this is a multi-tool coordinated pipeline, and the explore layer should provide such orchestration strategies.

The explore layer is not a code layer; it does not produce machine-consumable structured logs. Its output is decision reference documentation for AI.

### 3.2 Directory Structure

```
src/explore/
  strategy.md          # Exploration strategy documentation
```

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

- **No code templates**: No preset fill-in-the-blank code templates, avoiding constraints on AI creativity. Only specifies runtime signature contracts and prohibitions through specification documents.

- **AI-driven testing**: The system does not provide an automated testing framework. After command creation, AI calls `websculpt <domain> <action>` for testing, responsible for designing different parameter combinations to verify correctness and generalization.

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

When a command fails, the system does not automatically repair, but triggers an AI-led self-healing process:

```
Command failure
  -> Re-exploration with explore strategy (AI autonomous exploration)
  -> AI fixes code logic
  -> After compile validation, re-write to disk via command create
```

**Precipitation Trigger Mechanism**

Precipitation refers to the process of transforming exploration results into reusable command assets. Currently adopts mandatory proposal mode:

**Proposal Interaction Flow**

```
AI proposes precipitation proposal card -> Human agent confirms/modifies/rejects
  -> AI calls command draft to generate skeleton -> Edit business logic
  -> command validate pre-check
  -> Call command create to write to disk
```

**Proposal Format Specification**

AI proposals must contain the following fields:

| Field | Description |
|------|------|
| `domain` / `action` | Command name suggestion |
| `description` | One-sentence description of command purpose |
| `ioExamples` | At least one set of input parameter examples and expected output |
| `valueAssessment` | Why it's worth precipitating |
| `stabilityAssessment` | Structural stability assessment of target site/interface |
| `antiCrawlAssessment` | Anti-crawling risk and current circumvention strategy |
| `expectedFailures` | Known conditions under which it may fail and expected behavior |

Before explicit user confirmation, AI must not execute `draft` or `create`.

**Completeness of Precipitation Artifacts**

When precipitating, besides `manifest.json` and `command.js`, `README.md` and `context.md` are optional assets. If present, `README.md` should contain Description, Parameters, Return Value, Usage, Common Error Codes sections; `context.md` should contain Precipitation Background, Page Structure, Environment Dependencies, Failure Signals, Repair Clues sections. The validator issues warnings for missing or incomplete sections, but does not prevent writing to disk.

Current code has implemented basic execution exception identification (e.g., `PLAYWRIGHT_CLI_ATTACH_REQUIRED`), but **automatic detection and trigger mechanisms for the self-healing closure** (periodic inspection, version comparison, automatic degradation) are not yet implemented. Currently relies on manual discovery of command failures or AI actively identifying exceptions during execution to initiate repairs.

### 5.4 Responsibility Boundaries in Command Lifecycle

The design division between `command draft` and `command create` is based on one principle: **draft state allows trial and error, formal state enforces compliance**.

- `draft` generates compliant skeletons, does not validate, does not inject identity fields, letting agents focus on business logic.
- `validate` is a pre-check gate, read-only, no disk writes.
- `create` is the only legitimate entry point, executing hard-gate validation, identity injection, and conflict arbitration.

For specific behavior, see [CLI Command Reference](CLI.md).

---

## 6. Runtimes

WebSculpt currently supports two runtimes: `node` and `playwright-cli`. The `node` runtime executes via ESM import in a full Node.js environment; the `playwright-cli` runtime executes via code injection in an isolated browser context. `shell` and `python` are reserved types.

---

## 7. Directory Planning

### 7.1 Project Directory

```
WebSculpt/
├── src/
│   ├── access/          # Tool guides and behavioral constraints (doc layer)
│   ├── explore/         # Exploration strategy docs (doc layer)
│   ├── compile/         # Command specification docs (doc layer)
│   ├── cli/             # Entry points, engine, Meta commands, builtins, validators
│   ├── types/           # Cross-layer shared TypeScript type definitions
│   └── infra/           # Infrastructure utilities: user directory paths, config/log I/O
├── skills/websculpt/    # Agent skill deliverables
├── tests/               # Test suites
└── dist/                # Build output
```

`types/` and `infra/` do not belong to the four-layer business model, but are supporting infrastructure: `types/` provides cross-layer shared type contracts; `infra/` provides user directory path constants (`paths.ts`) and config/log persistence interfaces (`store.ts`), consumed by the CLI layer.

### 7.2 User Directory

```
~/.websculpt/
├── commands/                # User-defined extension commands
├── config.json              # User configuration
├── log.jsonl                # Execution logs
└── registry-index.json      # Persistent registry index (command manifest cache)
```
