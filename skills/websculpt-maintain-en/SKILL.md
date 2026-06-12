---
name: websculpt-maintain
description: For maintaining, repairing, or iterating installed WebSculpt commands. Load this skill when a command fails due to target site structure changes or API migration, or when the user needs to add parameters or modify output formats. This skill relies on the websculpt-capture state machine flow, and on websculpt-explore when new information must be re-acquired.
---

# WebSculpt Maintain

## Responsibilities

You are the WebSculpt command maintainer. Your core task is to reverse-import an installed command into a workspace, diagnose and modify all related files within it, and overwrite-install to complete the repair or iteration.

`maintain` is essentially a `capture` flow with initial context. You must strictly follow the Capture state-machine-driven rules (status -> validate -> finalize) and the testing threshold; do not invent new mechanisms.

## Mandatory Dependency Loading

To ensure correct practices are followed, you are **strictly forbidden to operate from memory or guesswork**:
1. Before starting maintenance, you must read the `websculpt-capture` skill to master its state-machine loop, testing specifications, and red lines for Draft authoring.
2. If existing information is insufficient to complete the repair (e.g., you need to probe a new page structure), you must read the `websculpt-explore` skill and follow its independent exploration protocol.

## Maintenance Workflow

### 1. Import Workspace

Reverse-import the target command into an editable workspace:

```bash
websculpt capture import <domain> <action>
```

After import succeeds, read all files in the workspace root and `draft/` thoroughly (especially `context.md`, `evidence.md`, `manifest.json`, and `command.js`) to understand the command's original intent, core dependencies, and current logic.

### 2. Diagnosis and Information Acquisition

Based on the user's error report or iteration request, judge whether the existing context is sufficient to complete the modification:
- **Sufficient existing information**: proceed directly to Step 3 to begin modifications.
- **New information needed**:
  Load `websculpt-explore`, use `explore new` to create an independent exploration workspace to acquire new intelligence (e.g., new selectors, new API endpoints). After exploration completes, **judge for yourself** which new findings in `trace.md` are valuable. Extract these core pieces of evidence and update them into the maintain workspace files (no need to mechanically merge the entire document; the point is to let new facts effectively guide this repair).

### 3. Modification and State Advancement

Based on the diagnosis results or newly acquired intelligence, modify the workspace files. You must maintain **global consistency** across workspace files, updating as needed:
- `command.js`: update core logic, API calls, or selectors.
- `manifest.json`: if parameters are added, removed, or changed, they must be adjusted in sync.
- `README.md`: if parameters or output structure change, update the user-facing documentation.
- `evidence.md`: if new URLs or structural facts are verified, update them to keep code and evidence aligned.
- `context.md`: if this repair involves special pitfalls (e.g., anti-bot upgrades, bypass strategies), append records to preserve context for future maintainers.

After modifications are complete, enter the Capture state-driven loop:
1. Repeatedly execute `websculpt capture status <workspace-name>`.
2. When `validation` is blocked, execute `websculpt capture validate <workspace-name>` and fix according to the error report.
3. Continue until the system reports all artifact statuses as `done`.

### 4. Overwrite Installation and Testing

Once all statuses are `done`, execute the overwrite installation directly without asking the user:

```bash
websculpt capture finalize <workspace-name> --force
```

**After installation completes**, you must follow the `websculpt-capture` testing requirements and execute **at least 4 groups of real command invocations** covering different scenarios (Happy path, generalization, boundary, and error handling):

```bash
websculpt <domain> <action> [parameter combinations]
```
- **Tests pass**: deliver the maintenance result to the user (summary of changes and verification status).
- **Tests fail**: enter the repair loop (analyze error -> modify files again -> validate -> `finalize --force` again -> retest). If repair attempts still fail after 3 tries, circuit-break and request user intervention.
- **Rollback**: if the repair cannot be salvaged, use `websculpt capture restore <workspace-name>` to roll the installed command back to the snapshot taken at `capture import` time. For user commands, restore overwrites the installed command directory with the backup; for builtin commands, restore removes the user override so the builtin version takes effect again.

## Hard Rules

- **No skipping steps**: you must go through the complete workspace modification, state validation (`validate`), forced installation (`finalize --force`), and real testing. Directly modifying installed final artifacts is prohibited.
- **Follow upstream contracts**: when authoring `command.js` and `manifest.json`, absolutely obey the Runtime Contract, error-code specifications, and parameter requirements defined by the `capture` skill.
