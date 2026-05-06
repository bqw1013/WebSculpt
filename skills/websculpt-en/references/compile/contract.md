# Command Asset Authoring Contract

> This document defines the general authoring specifications for WebSculpt extension commands, covering manifest format, runtime selection, asset documentation standards, and the precipitation workflow.
>
> **If you have already determined the runtime, read the corresponding contract directly:**
> - `node` → [`./node-contract.md`](./node-contract.md)
> - `playwright-cli` → [`./playwright-cli-contract.md`](./playwright-cli-contract.md)

---

## 1. How to Choose Runtime

### Decision Matrix

| Your Need | Recommended Runtime | Key Limitation |
|---------|-------------|---------|
| Need browser APIs (DOM manipulation, page navigation, screenshots, reuse login state) | `playwright-cli` | No Node.js APIs (`fs`, `path`, `require` unavailable); `console.log` invisible; must operate browser through `page` |
| Pure Node.js logic (HTTP requests, file I/O, data cleaning, child process calls) | `node` | No browser APIs; cannot access already opened browser pages |
| Need both HTTP requests and browser operations | Split into two commands (`node` handles HTTP + `playwright-cli` handles browser), or chain by caller | One command can only declare one runtime, cannot mix |

### Reverse Exclusion

The following situations will directly render a runtime unavailable:

- **Need to read/write local files** → Cannot use `playwright-cli` (isolated context, no `fs`/`path`).
- **Need `console.log` debug output** → Prioritize `node`; in `playwright-cli` debug info can only be brought out through `return`.
- **Need to operate already opened browser tabs (screenshots, clicks, extract DOM)** → Cannot use `node`; must use `playwright-cli`.
- **Need to call `require` or `import` external modules** → Cannot use `playwright-cli`.

### Handling Strategy When Commands Cannot Be Mixed

One command can only declare one runtime. If business logic needs both browser and file system:

1. **Priority split**: Precipitate browser operations as a `playwright-cli` command, and data processing as a `node` command, chained by the caller.
2. **Secondary compromise**: If splitting cost is too high, use `page.evaluate(() => fetch(...))` to initiate requests in the `playwright-cli` command (constrained by browser CORS and Cookie policies), or move file operations outside the command for the caller to handle.

### Runtime Differences Quick Reference

| Dimension | `node` | `playwright-cli` |
|------|--------|------------------|
| Entry file requirement | Standard ESM module, exports default async function via `export default` | Function body fragment; entire file content is wrapped in `()` and executed in VM |
| Entry signature | `export default async (params) => {...}` | `async function (page) { /* PARAMS_INJECT */ ... }` |
| Parameter method | Runner directly passes as function argument | Runner replaces `/* PARAMS_INJECT */` with `const params = {...}` |
| Runtime environment | Full Node.js (`fs`, `fetch`, `console` available) | Isolated context (no Node.js API, `console.log` invisible) |
| Browser API | Unavailable | Available through `page` parameter |
| Return value passing | Runner consumes function return value | Runner parses JSON after `### Result\n` from stdout |
| Debug method | `console.log` outputs to stderr/stdout | `console.log` invisible, debug data brought out through `return` |
| Page isolation | Not applicable | Must create isolated page and close in `finally` |
| Error code passing | `error.code = "NOT_FOUND"` | Message text contains `[NOT_FOUND] ...` |

The following is only for quick comparison. Implementation details must follow your selected runtime contract document.

> Precipitated commands must be `node` or `playwright-cli` runtime. If during exploration other languages (such as Python, Shell) prove superior, evaluate rewriting as a Node.js equivalent implementation; if rewriting cost is too high or infeasible, this path does not enter the command library, and is treated as a one-time exploration result.

**After selecting the runtime, you must read the corresponding runtime contract document.** For `node` runtime see [`./node-contract.md`](./node-contract.md); for `playwright-cli` runtime see [`./playwright-cli-contract.md`](./playwright-cli-contract.md). Subsequent sections of this document (command asset specifications, error codes) are general constraints for both runtimes and still need to be read.

---

## 2. Precipitation Execution Flow

> For any questions about CLI commands mentioned in this document, prioritize executing `websculpt <command> --help` to get real-time help.

After user confirms the precipitation proposal, execute in the following flow:

### Generate Skeleton
```bash
websculpt command draft <domain> <action> --runtime <rt>
```
Defaults output to `.websculpt-drafts/<domain>-<action>/` (can override with `--to <path>`), generating `manifest.json` (metadata, no identity fields at this stage), entry file (default `command.js`), `README.md`, and `context.md`. For specific parameters, see `websculpt command draft --help`.

### Write Command
Based on verified results from exploration, write business logic and refine documentation according to this document and the corresponding runtime contract: implement business logic in the entry file according to runtime specifications; adjust parameters, descriptions, and other metadata in `manifest.json`; fill `README.md` and `context.md` according to Section 3 specifications. `id`/`domain`/`action` do not need to be concerned during draft and writing phases, `create` will forcibly inject them.

### Pre-check Compliance
```bash
websculpt command validate --from-dir <path>
```
Executes L1-L3 layered validation (L1 Structure: manifest fields, types, consistency; L2 Compliance: prohibited code patterns (static analysis); L3 Contract: code structure consistency with manifest), failure prevents disk write. If not passed, return to **Write Command** to modify and re-validate until passed.

### Install and Write to Disk
```bash
websculpt command create <domain> <action> --from-dir <path>
```
`create` authoritatively injects `id`/`domain`/`action` using CLI parameters. L1-L3 validation failure unconditionally prevents disk write, even when using `--force`.

### Test and Verify
After installation and disk write, the command must be executed for verification: first execute **correctness test** (execute using parameters verified during exploration, confirm output matches expectations), then execute **generalization test** (execute using different parameter combinations, confirm the command does not depend on hard-coded specific values). If any test fails, return to **Write Command** to fix, then re-execute validate → create → test.

---

## 3. Command Asset Specifications

A complete command package consists of the following files. When precipitating to the command library, all files must be complete; during draft phase, `manifest.json` and the entry file are the minimum runnable set.

### 3.1 manifest.json

`manifest.json` is the command's metadata declaration, generated as a skeleton by `command draft`, with identity fields forcibly injected by `command create`.

| Field | Type | Required | Description |
|------|------|------|------|
| `id` | `string` | System injected | Format is `{domain}-{action}`, can be missing during draft phase, forcibly injected at create |
| `domain` | `string` | System injected | Command domain, forcibly overridden by CLI parameter at create |
| `action` | `string` | System injected | Command action name, forcibly overridden by CLI parameter at create |
| `description` | `string` | Yes | Command purpose, **cannot be empty string or whitespace only** |
| `runtime` | `string` | Yes | `node` or `playwright-cli`. `shell`, `python` are CLI reserved types, but when precipitating to command library must be rewritten as `node` or `playwright-cli` equivalent implementation |
| `parameters` | `array` | No | Parameter list, elements are `{ name, required?, default?, description? }` |
| `prerequisites` | `string[]` | No | Command-specific prerequisite descriptions (e.g., `"Requires user login"`) |
| `requiresBrowser` | `boolean` | **Yes** | Whether the command depends on browser environment. `playwright-cli` must be `true`, `node` must be `false`. `command draft` auto-fills according to runtime |
| `authRequired` | `string` | No | `"required"` / `"not-required"` / `"unknown"`. Whether the command requires user login, default `"unknown"` |
| `entryFile` | `string` | No | Entry file name, default `command.js` |

**Reserved domains**: `command`, `config`, `skill`, `daemon` are system reserved, usage will trigger `RESERVED_DOMAIN` error.

### 3.2 Entry File

See corresponding runtime contract document for details:
- `node` → [`./node-contract.md`](./node-contract.md)
- `playwright-cli` → [`./playwright-cli-contract.md`](./playwright-cli-contract.md)

### 3.3 README.md

Facing command callers, answering "how to use this command".

`command draft` has already pre-generated standard section skeletons, please fill content on this basis, **do not delete or rename section titles**.

**Must not contain**: DOM selectors, API endpoints, anti-crawling strategies, failure predictions.

### 3.4 context.md

Facing command fixers, answering "why this command is implemented this way, and how to fix it when broken".

`command draft` has already pre-generated standard section skeletons, please fill content on this basis, **do not delete or rename section titles**.

**Must not contain**: parameter usage descriptions, usage examples, general suggestions.

context.md contains the following sections:

| Section | Purpose |
|------|------|
| `## Precipitation Background` | Precipitation history of the command: why it was created, what problem it solves |
| `## Value Assessment` | Reuse value assessment: generality, reuse frequency, time saved, from the precipitation proposal card's `valueAssessment` |
| `## Page Structure` | Key URLs, selectors, or interaction sequences |
| `## Environment Dependencies` | Login state, browser config, **anti-crawl strategies, stability notes** |
| `## Failure Signals` | Failure manifestations when the page changes (e.g., selector returns null, throws DRIFT_DETECTED) |
| `## Repair Clues` | Backup plans, alternative entry points |

> `## Environment Dependencies` explicitly covers anti-crawl strategies and stability notes. The `antiCrawlAssessment` and `stabilityAssessment` fields from the precipitation proposal card should be summarized here.

---

## 4. Business Error Code Reference

The following business error codes apply to **both runtimes**. Passing mechanisms differ (see each runtime-specific document for details), but semantics are consistent.

| Error Code | Typical Scenario |
|--------|----------|
| `AUTH_REQUIRED` | Login required to access |
| `NOT_FOUND` | Target resource does not exist |
| `EMPTY_RESULT` | Exists but result is empty |
| `MISSING_PARAM` | Missing required parameter |
| `DRIFT_DETECTED` | Page structure has changed |

If runner cannot match a known business error code, it is categorized as `COMMAND_EXECUTION_ERROR`.

---

## 5. Quick Checklist

### L1 Structure (manifest validation)

- [ ] `manifest.json` contains non-empty `description` field (cannot be empty string or whitespace only)

### Asset Quality (warning when missing)

- [ ] If `README.md` exists, contains `## Description`, `## Parameters`, `## Return Value`, `## Usage`, `## Common Error Codes` sections
- [ ] If `context.md` exists, contains `## Precipitation Background`, `## Value Assessment`, `## Page Structure`, `## Environment Dependencies`, `## Failure Signals`, `## Repair Clues` sections

### L2 Compliance (prohibited patterns and documentation red lines)

- [ ] `README.md` never contains CSS selectors or DOM paths
- [ ] `context.md` never contains parameter usage or usage examples
- [ ] No `|| default` form parameter fallback in code

### L3 Contract (code structure and runtime consistency)

All runtimes:
- [ ] Numeric parameters converted via `parseInt` / `parseFloat`
- [ ] Error messages contain expected business error codes (e.g., `[NOT_FOUND] ...`)
- [ ] Return value is serializable pure data object

`playwright-cli` specific: see [`./playwright-cli-contract.md`](./playwright-cli-contract.md)
- [ ] Entry file exports async function via `export default`
- [ ] Signature is `async (page, params) => unknown`

`node` specific: see [`./node-contract.md`](./node-contract.md)
- [ ] Entry file exports async function via `export default`
- [ ] Signature is `async (params: Record<string, string>) => unknown`

---

## 6. General Runner Error Code Reference

The following error codes are automatically generated by the runner, **do not need** to be thrown in command files:

| Error Code | Meaning | Applicable Runtime |
|--------|------|-------------|
| `TIMEOUT` | Command execution timeout | All |
| `COMMAND_EXECUTION_ERROR` | Unclassified command execution error | All |

Runtime-specific runner error codes, see corresponding runtime contract document.
