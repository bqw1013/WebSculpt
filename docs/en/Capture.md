# WebSculpt Capture Design Overview

> This document is intended for developers and advanced users. It explains the design intent, core concepts, and key mechanisms of the Capture workflow. For command usage and parameter details, see [`CLI.md`](./CLI.md).

---

## 1. Positioning and Boundaries

### 1.1 What is Capture

Capture is a **lightweight workspace** introduced between "exploration paths" and "formal command assets." After an Agent completes information acquisition, instead of immediately persisting as a command, the results enter an inspected, recoverable, and auditable solidification process.

Its core responsibilities:

- **Solidify evidence**: `evidence.md` records exploration paths, verified URLs, selectors, failure signals, etc. It is the only bridge across sessions.
- **State machine driven**: The Agent does not need to understand the full workflow; it only needs to loop executing `capture status` and advance according to the returned `next.action`.
- **Hard gate installation**: Only after evidence, code, documentation, and validation all pass can `capture finalize` promote the asset into the command library.

### 1.2 Two Creation Paths

WebSculpt supports two ways to create extension commands. Both install to the same location (`~/.websculpt/commands/<domain>/<action>/`) with an identical command package structure:

| Path | Command | Use Case |
|------|---------|----------|
| **Direct creation** | `command draft / validate / create` | Manual authoring, scripting, well-defined requirements |
| **Capture workflow** | `capture new / status / validate / finalize` | Agent-driven, requires recording evidence and advancing via state machine |

The Capture path reuses the `command validate` and `command create` capabilities under the hood, with additional evidence auditing and draft fingerprint tamper resistance.

### 1.3 Relationship with Explore

Explore must be usable independently (users want data only, without capture). Only when the user explicitly agrees to solidify explore results into a command does the Capture workflow begin.

---

## 2. Workspace Structure

The workspace is located in the **current project directory**:

```text
.websculpt-captures/
└── <name>/
    ├── capture.yaml      # Machine-readable metadata + command library snapshot (written at creation, read-only afterwards)
    ├── evidence.md       # Exploration evidence (filled by Agent, audited by system)
    ├── draft/            # Command package skeleton (generated alongside capture new)
    │   ├── manifest.json # Pre-filled domain/action/runtime, id left empty
    │   ├── command.js    # Runtime entry template
    │   ├── README.md     # Template
    │   └── context.md    # Template
    └── validation.json   # Most recent validate result (includes draft fingerprint)
```

**Design intent**:

- `capture.yaml` does not store state; it only stores identity declarations and objective deduplication data. State is computed on-the-fly by `capture status` on each invocation.
- `evidence.md` and `draft/` are separated to ensure a clear physical boundary between "why it was built" and "how it is built."
- `validation.json` serves as the persistent credential of an external action (`capture validate`), inspected by the state machine and finalize.

---

## 3. Core Design Concepts

### 3.1 Six-Artifact Pipeline

The Capture workflow consists of 6 artifacts, advancing through strict layered dependencies:

```text
evidence (done)
    |
    v
command (ready / done / blocked)
    |
    v
manifest (ready / done / blocked)
    |
    v
readme (ready / done / blocked)
    |
    v
context (ready / done / blocked)
    |
    v
validation (blocked / done)
```

Each artifact must wait for the preceding artifact to reach `done` before it can leave `blocked`. If a preceding artifact regresses (e.g., evidence heading is deleted, TODO is re-added), subsequent artifacts immediately regress in cascade.

Three state meanings:

- `blocked`: Prerequisites are not satisfied; cannot advance
- `ready`: Prerequisites are satisfied, but content is still a template (e.g., contains TODO marker)
- `done`: Content is substantively complete

### 3.2 Purely Functional State Machine

`capture status` is a **purely functional state machine**: each invocation re-reads the file system, computes the current state and next action based on the scan results, and maintains no in-memory persistent state.

Properties this brings:

- **Agent can modify files freely**; `capture status` always returns the latest truth
- **Cross-session safety**: a new session's unfamiliar Agent only needs to execute `capture status <name>` to know what to do next
- **Determinism**: given the same file system snapshot, the output is always identical

The specific transition functions and judgment chains of the state machine are maintained by the CLI internal implementation.

### 3.3 `capture status` Driven Mode

The Agent does not need to understand the entire capture flow. It only needs:

```text
Loop:
  Execute capture status <name>
  If readyToFinalize == true, break the loop
  Execute the corresponding action according to next.action
```

The `next.action` value space is fixed:

- `fill-evidence` -> Edit `evidence.md`
- `fill-command` -> Implement entry file
- `fill-manifest` -> Fill `manifest.json`
- `fill-readme` -> Write `README.md`
- `fill-context` -> Write `context.md`
- `validate` -> Execute `capture validate <name>`
- `request-user-confirmation` -> Show summary to user and request confirmation

This layer of abstraction encapsulates the state machine complexity inside the CLI. The Agent sees a simple "current state + next action" interface.

---

## 4. Key Mechanisms

### 4.1 Evidence Audit

Evidence is a three-level Markdown audit of `evidence.md`.

| Level | Check Content | Blocking |
|-------|---------------|----------|
| **L1 Structure** | Whether the 5 required H2 headings exist precisely | Yes |
| **L2 Content** | Whether each H2 has substantive content (non-empty, non-comment, non-heading) | Yes |
| **L3 Keywords** | For browser runtime, whether `guide.md` is mentioned; whether `http(s)://` exists | No, warning only |

**Design rationale**:

- L1/L2 are hard gates to prevent Agents from skipping evidence recording and jumping straight to code.
- L3 is a soft rule because string matching is prone to false positives and should not block normal workflows.
- The 5 headings (Exploration Path / Verified URLs / Structural Evidence / Failure Signals / Capture Assessment) are fixed and must not be modified by Agents, ensuring cross-session parseability.

### 4.2 Validation Fingerprint

After `capture validate <name>` succeeds, the SHA256 fingerprint of the current draft files is computed and written to `validation.json`.

Fingerprint coverage:

- `domain` / `action` / `runtime` from `capture.yaml` (used as salt)
- `draft/manifest.json`
- Runtime entry file
- `draft/README.md`
- `draft/context.md`

**Design rationale**:

Prevent the bypass behavior of "modifying code after validation passes." If an Agent modifies the draft after `validate` succeeds, `capture status` will regress `validation` to `blocked`, and `capture finalize` will return `VALIDATION_STALE`.

This mechanism turns "validation passed" from a one-time action into a continuous assertion bound to file content.

---

## 5. Finalize Hard Gate

`capture finalize` is the only exit of the state machine. The following conditions must all be satisfied for installation:

1. `validation.json` exists and `success === true`
2. The fingerprint in `validation.json` matches the current draft fingerprint (not stale)
3. `evidence.md` passes audit (L1 + L2)
4. `capture status` returns `readyToFinalize === true` (i.e., all 6 artifacts are `done`)

When any gate is not satisfied, an explicit error code is returned; silent degradation does not occur.

After successful installation, `evidence.md` is copied to the command directory. Even if the workspace is cleaned up later, the evidence archive is retained.

Additionally, if an active scope exists in the current working directory or any ancestor directory, `capture finalize` automatically appends the newly created command to that scope's whitelist. This step is best-effort: a failure to append does not block the finalize itself.

---

## 6. Boundaries and Limitations

- If a builtin command already exists at `capture new`, a `BUILTIN_OVERRIDE` warning is issued but execution is allowed. If a user command already exists, it is blocked by default and can be overridden with `--force`.
- The command package lifecycle for `shell` and `python` runtimes (draft / validate / create) is already supported, but the CLI execution engine has not yet been integrated. A `RUNTIME_NOT_EXECUTABLE` warning is attached at creation time.
- The workspace is retained in `.websculpt-captures/` under the project directory, not the user home directory. The Agent should decide on its own whether to clean up after the user rejects finalize.
