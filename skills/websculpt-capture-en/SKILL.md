---
name: websculpt-capture-en
description: For scenarios where information acquisition paths are solidified into locally reusable WebSculpt commands. Once verified paths are turned into command assets, subsequent similar needs can be invoked directly without repeated exploration, saving context and tokens. This skill is only loaded after the path has been verified during the explore phase. Load this skill when the user agrees to solidify explore results, or needs to turn proven webpage/API/browser extraction logic into local command assets. If the path has not been verified by explore, you must first load websculpt-explore to complete exploration.
---

# WebSculpt Capture

## Responsibilities

You are the WebSculpt capture implementer, responsible for transforming verified information acquisition paths into locally reusable and executable `domain/action` command assets.

You bear **full responsibility for command design quality, implementation correctness, and delivery usability**. The CLI state machine checks the completion progress of each artifact via `capture status`; you are responsible for driving the state forward and ensuring content correctness. Commands must be verified through real invocation before installation.

**Exploration prerequisite**: capture must be built on a verified path. If the current path has not been verified during the explore phase (no `trace.md` audit completion record), you must first load `websculpt-explore` to complete exploration, fill in `trace.md`, execute `explore assess <name>` to pass the audit, then set `exploreVerified` to `true` before entering capture.

Post-delivery failures caused by target page or API changes are handled by `websculpt-repair` and are outside the scope of capture.

## CaptureSession (Mandatory)

After entering the capture phase, only output CaptureSession. The **end** of every reply must output the current CaptureSession state block. The format is as follows:

```yaml
CaptureSession:
  exploreVerified: false
  contractRead: false
  testScenarios: []
  testResults: []
  repairCount: 0
  repairStep: null
```

### State Rules

- When `exploreVerified` is `false`, **forbidden** to execute `capture new`. Must first confirm the path has been verified by explore; if not, must first load `websculpt-explore` to complete exploration.
- When `contractRead` is `false`, **forbidden** to edit or modify `draft/command.js`. Must first read the contract document for the corresponding runtime and set to `true`.
- When `testScenarios` is empty, **forbidden** to execute `capture finalize`. Before finalize, you must list the specific commands for 4 test groups, covering happy path, generalized parameters, boundary parameters, and error scenarios.
- When `testResults` length < 4, **forbidden** to report "tests passed" or "testing complete".
- During repair loops, `repairStep` must advance in order; skipping steps is prohibited:
  1. `null` → modify draft file → `modify`
  2. `modify` → execute `capture status` → `status1`
  3. `status1` → execute `capture validate` → `validate`
  4. `validate` → execute `capture status` → `status2`
  5. `status2` → execute `capture finalize --force` → `finalize`
  6. `finalize` → reset to `null`, `repairCount += 1`, re-execute all 4 test groups
- When `repairCount >= 3`, **must** stop the automatic loop, report the issue to the user, and hand the decision to the user.

### Update Timing

- After confirming the path has been verified by explore: set `exploreVerified` to `true`
- After reading the contract document for the corresponding runtime: set `contractRead` to `true`
- Before finalize: design 4 test groups, write into `testScenarios`
- After each test group execution: record results to `testResults`
- When entering repair loop: `repairCount += 1`, set `repairStep` to `modify`
- After each repair action completes: update `repairStep` in order
- After repair completes (after `finalize --force`): reset `repairStep` to `null`

## Workflow

1. Confirm `exploreVerified: true` (`explore assess` has returned `status: passed`), then execute `capture new` to create a workspace.
2. Directly enter the state-driven loop.
3. Repeatedly execute `capture status`, driving forward according to artifact status (fill in evidence and draft files, execute `capture validate`), until all artifacts are `done`.
4. Execute `capture finalize` to install as an executable command.
5. Execute at least 4 groups of real command tests; if they fail, enter the repair loop.

### 1. Creation

Execute the following command to create a capture workspace:

```bash
websculpt capture new <name> --domain <domain> --action <action> --runtime <runtime>
```

Use a noun for `domain` and a verb for `action`; name them according to path semantics, ensuring no conflict with existing commands. `name` is the workspace identifier and can be freely defined (e.g., a variant of `{domain}-{action}`).

Select `runtime` based on the tools used during the exploration phase:

| Requirement | runtime |
|-------------|---------|
| HTTP requests, public APIs, data cleaning | `node` |
| DOM operations, page navigation, screenshots, reusing login state | `browser` |
| Needs both browser and local filesystem simultaneously | Split into multiple commands, or ask user to confirm boundaries |

A command can only declare one runtime.

`capture new` creates a `.websculpt-captures/<name>/` workspace in the current directory, containing the following files:

| File | Location | Description |
|------|----------|-------------|
| `capture.yaml` | Workspace root | Workspace identity anchor; domain/action/runtime are fixed after creation, subsequent drafts must remain consistent with them |
| `evidence.md` | Workspace root | Exploration evidence, filled in by you |
| `manifest.json` | `draft/` | Command metadata |
| `command.js` | `draft/` | Command implementation |
| `README.md` | `draft/` | Documentation for callers |
| `context.md` | `draft/` | Context for future repairers |

After creation, report to the user that the workspace has been created. If `capture new` outputs conflict warnings (e.g., `BUILTIN_OVERRIDE`), inform the user as well, then directly enter the state-driven loop.

### 2. State-Driven Loop

Repeatedly execute `capture status <name>`, drive forward according to returned prompts, then re-query status until all artifacts are complete.

**Key Rules**:

- `validation` advances by executing `capture validate <name>`, not by modifying files.
- If draft is modified after validation passes, `validation` will revert to `blocked` due to fingerprint invalidation; must re-validate.
- Prohibited to advance from memory; after each action completes, must re-execute `capture status`.

#### `capture validate` Validation Content

When evidence, command, manifest, readme, and context are all `done`, `validation` will require executing `capture validate`:

```bash
websculpt capture validate <name>
```

`capture validate` checks the legality of the draft, including manifest structure, code compliance, and runtime contract matching. Validation failures return specific error messages; fix according to prompts. After validation passes, `validation.json` is generated and draft file fingerprints are calculated. If draft files are modified later, the fingerprint becomes invalid, and `validation` will revert to `blocked` when `capture status` is executed again, requiring re-validation.

### 3. Installation

When `capture status` returns all artifacts as `done`, execute directly:

```bash
websculpt capture finalize <name>
```

**Note**: No need to ask the user again at this point; just execute finalize directly. First-time installation does not require `--force`; overwriting an installed command requires appending `--force`.

**Key Rule**: Installed commands are only copies of the draft. When problems are found, only modify the workspace draft files and re-finalize; do not directly modify the installed directory. The workspace is retained for subsequent repair reference.

### 4. Post-Installation Testing

After installation is complete, must execute **at least 4 groups of real command invocations**, mandatorily covering the following scenarios:

| # | Scenario | Purpose |
|---|----------|---------|
| 1 | Happy path: use the core parameter combination verified during the exploration phase | Verify correctness, output structure is consistent with expectations |
| 2 | Different valid parameter combinations (different filtering conditions, time ranges, etc., from core parameters) | Verify generalization |
| 3 | Boundary parameters (empty values, limit values, optional parameters omitted) | Verify robustness |
| 4 | Error scenarios (invalid parameters, resource does not exist, missing required parameters) | Verify error handling and return codes |

Test flow example:

```bash
websculpt <domain> <action> --param1 value1
websculpt <domain> <action> --param1 value2 --param2 value3
websculpt <domain> <action> --param1 ""
websculpt <domain> <action> --invalid-param value
```

Before finalize, first write the specific commands for the 4 test groups into `testScenarios`, confirm coverage is complete, then execute `capture finalize`.

After testing completes, report results to the user:

- **All passed**: report key verification points for each scenario.
- **Problems found and fixed**: report the cause, fix measures, and final verification results.

**Enter repair loop upon test failure**:

1. `repairCount += 1`, set `repairStep` to `modify`. Analyze cause and modify draft files.
2. Update `repairStep` to `status1`, execute `capture status <name>`.
3. Update `repairStep` to `validate`, execute `capture validate <name>`.
4. Update `repairStep` to `status2`, execute `capture status <name>`.
5. Update `repairStep` to `finalize`, execute `capture finalize <name> --force`.
6. Reset `repairStep` to `null`, re-execute all 4 test groups, record results to `testResults`.
7. **Circuit breaker**: when `repairCount >= 3`, stop automatic loop, report issue to user, and hand decision to user.

## Evidence Writing Specifications

`evidence.md` is the source of truth for the capture phase; the entire document must be written in English, and **the 5 H2 headings must not be modified**.

The original template already contains writing prompts for each heading; only supplementary emphasis is provided here:

- URLs in `Verified URLs` must include the protocol.
- `Structural Evidence` is the implementation basis for `command.js`; proven structural facts must be clearly written.
- `browser` runtime needs to explain in `Exploration Path` whether `guide.md` was consulted.
- Missing headings or empty content under a heading will block audit; keyword gaps will not block, only serve as a warning.

## Draft Implementation Specifications

### `manifest.json`

`capture new` has already auto-generated identity fields (id, domain, action, runtime) and `requiresBrowser`; open the file to see them.

Content you need to supplement:
- `description`: non-empty description. `capture status` uses this to determine whether manifest is complete.
  - Requirement: explain what the command does, what input it needs, and what result it returns; length should be moderate. This description is displayed in the command list; too short or vague will make it unclear to users.
- `parameters`: declare according to `params.xxx` actually used in `command.js`; names must not repeat.

  Example:

  ```json
  "parameters": [
    { "name": "query", "description": "Search keyword", "required": true },
    { "name": "limit", "description": "Number of results to return", "required": false, "default": 10 }
  ]
  ```
- `authRequired`: whether the command requires login/authentication.
  - `"required"`: login needed (e.g., accessing personal data)
  - `"not-required"`: login not needed (e.g., public API)
  - `"unknown"`: default value, not recommended to keep

Key constraints:
- `params.xxx` accessed in `command.js` must be declared in `parameters`, otherwise `capture validate` will error.
- Parameters already declared with `default` in manifest should not have fallback written again in `command.js`.

### `command.js`

**Reading prerequisite**: Before editing `draft/command.js`, you **must** read the contract document for the corresponding runtime (`skills/websculpt-capture-en/references/node-contract.md` or `browser-contract.md`). After reading, set `CaptureSession.contractRead` to `true`. When `contractRead` is `false`, editing or modifying `command.js` is prohibited.

Export format: `export default async function(params)` (node) or `export default async (page, params)` (browser).

Core constraints:
- Parameter values are all strings; use `parseInt`/`parseFloat` for numbers, `=== "true"` for booleans.
- Return value must be serializable pure data.
- Business errors: `const err = new Error("[CODE] message"); err.code = "CODE"; throw err;`
- Can only import Node.js built-in modules; third-party dependencies and inline imports are prohibited.

Detailed specifications see `skills/websculpt-capture-en/references/node-contract.md` or `skills/websculpt-capture-en/references/browser-contract.md` (according to runtime).

Error code specification: uppercase snake_case, semantically clear. Examples: `AUTH_REQUIRED` (login needed), `NOT_FOUND` (resource does not exist), `EMPTY_RESULT` (result is empty), `MISSING_PARAM` (missing required parameter), `DRIFT_DETECTED` (page structure changed).

## Prohibited

- Must not execute `capture new` when the path has not been verified by explore (`exploreVerified: false`).
- Must not edit `draft/command.js` before `contractRead` is `true`.
- Must not force advancement when `capture status` returns blocked.
- Must not fill in draft before evidence audit passes.
- After `capture new`, directly enter the state-driven loop.
- Must not directly modify installed commands (always modify workspace draft and re-finalize).
