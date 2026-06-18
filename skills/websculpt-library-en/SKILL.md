---
name: websculpt-library
description: Governs the organization of the command library. Load this skill when users need to control which commands are visible/available (too many commands, irrelevant commands for the project, wanting a cleaner view) or need to package and migrate commands (export for sharing, import from others, cross-machine transfer, backing up the command library). Under the hood, scope sub-commands manage project-level whitelists, while command export/import enable portable packaging and sharing of the command library.
---

# WebSculpt Library

## Positioning

Library is the governance layer for the WebSculpt command library, responsible for two duties:

1. **Visibility control (scope)**: Project-level whitelist that determines what `command list` displays. It does not change how commands execute or control permissions — it only filters "what you see."
2. **Portable sharing (export/import)**: Cross-installation packaging of the command library for team sharing, cross-machine migration, or backup.

## 1. Visibility Control (scope)

Scope is WebSculpt's project-level command visibility mechanism. As the command library grows, the globally available extension commands may contain many entries irrelevant to the current project. Scope controls what `command list` displays by default through a whitelist maintained in the project directory.

### Core Mechanism

- **Whitelist filtering**: Only commands listed in `.websculpt/scope.json` are visible
- **Upward traversal**: The system searches upward from the current working directory for the nearest `scope.json`
- **No scope means all open**: When no scope is found, all commands are displayed
- **`--all` bypass**: `websculpt command list --all` temporarily ignores scope filtering

### Command Reference

#### `scope init`

Initialize a scope in the current directory, creating `.websculpt/scope.json` (whitelist starts empty; at this point `command list` shows no extension commands — they become visible only after being explicitly added via `scope add`).

```bash
websculpt scope init
```

#### `scope show`

Display the active scope configuration. Traverses upward from the current directory to find the nearest `scope.json`, then shows the whitelist and the availability status of each command.

```bash
websculpt scope show
```

Returns a prompt indicating all commands are visible when no scope is configured.

#### `scope add <identifier>`

Add a command to the active scope whitelist.

```bash
websculpt scope add <identifier>
```

`identifier` supports two forms:

- `domain/action`: Add a single command, e.g. `github/list-trending`
- `domain`: Bulk-add all commands **currently installed** in that domain, e.g. `github`. Note this is a snapshot operation; newly captured commands in the same domain will not be automatically included and require another `scope add`.

#### `scope remove <identifier>`

Remove a command from the active scope whitelist.

```bash
websculpt scope remove <identifier>
```

Supports `domain/action` for precise removal, or `domain` to bulk-remove all commands in that domain.

#### `scope destroy`

Destroy the scope in the current directory, removing `.websculpt/scope.json`. After destruction, scope falls back to the nearest ancestor `scope.json`; if no ancestor scope exists, reverts to showing all commands. Does not affect ancestor scopes.

```bash
websculpt scope destroy
```

### Relationship with Capture

After `capture finalize` installs a new command, it automatically appends the command to the nearest active scope whitelist (best-effort; failure does not block installation). If no scope exists anywhere in the current directory chain, this step is silently skipped, as the command is globally visible anyway. Therefore, commands captured through the capture workflow usually enter the current project's view automatically.

---

## 2. Portable Sharing (export/import)

Use export/import when you need to migrate the command library from one WebSculpt installation to another. The export artifact is a plain directory that can be committed to Git or distributed in any way.

### Export Package Structure

```
<dir>/
  ├── index.json          ← exported command list
  └── commands/
      └── <domain>/
          └── <action>/
              ├── manifest.json
              ├── command.js
              ├── README.md      (if present)
              ├── context.md     (if present)
              └── evidence.md    (if present)
```

### Command Reference

#### `command export`

Export currently visible extension commands into a portable directory package. Exports the effective runtime view after user-over-builtin resolution (equivalent to `command list --all`, unaffected by scope whitelist).

```bash
websculpt command export [identifiers...] --to <dir> [--force]
```

| Option / Argument | Description |
|------|------|
| `--to <dir>` | Target directory for the export package (**required**) |
| `--force` | Overwrite non-empty target directory |
| `[identifiers...]` | Optional, commands to export: `domain` (all in that domain) or `domain/action` (single command). Omitting exports all |

#### `command import`

Install commands from an export package into the local user command library.

```bash
websculpt command import --from <dir> [--force] [--dry-run]
```

| Option | Description |
|------|------|
| `--from <dir>` | Path to the export package directory (**required**) |
| `--force` | Overwrite existing user commands with the same name |
| `--dry-run` | Validate and report conflicts without writing any files |

### Key Behaviors

- Before importing, all commands undergo L1–L3 layered validation: any failure aborts the entire import with zero side effects
- Existing user commands: skipped by default, overwritten with `--force`
- Exporting to a non-empty target directory requires `--force`
- When exported commands contain `evidence.md`, an `EVIDENCE_INCLUDED` warning is shown
- `--dry-run` performs no writes and does not modify the registry

---

## Typical Scenarios

| Scenario | Operation |
|------|------|
| Starting a new project and wanting to keep only relevant commands | `scope init` + `scope add <relevant commands>` |
| Command library bloated, current project view too noisy | `scope show` to diagnose → `scope remove <irrelevant commands>` |
| Need to view the global command library (bypassing scope filtering) | `websculpt command list --all` |
| Sharing commands with team members | `command export --to <dir>` to package → share the directory |
| Installing a command package received from the team | `command import --from <dir>` |
| Migrating to a new machine, backing up the current command library | `command export --to <backup dir>` → on the new machine: `command import --from <backup dir>` |
| Previewing import effects without actually writing | `command import --from <dir> --dry-run` |
| Force-overwriting existing commands during import | `command import --from <dir> --force` |
