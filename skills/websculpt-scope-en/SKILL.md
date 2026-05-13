---
name: websculpt-scope
description: For managing WebSculpt project-level command visibility. Load this skill when the user mentions the command list being too long, wants to trim commands by project, or needs to control which commands are visible in a specific directory.
---

# WebSculpt Scope

## Positioning

Scope is WebSculpt's project-level command visibility mechanism. As the command library grows, the globally available extension commands may contain many entries irrelevant to the current project. Scope controls what `command list` and CLI help display by default through a whitelist maintained in the project directory.

## Core Mechanism

- **Whitelist filtering**: Only commands listed in `.websculpt/scope.json` are visible
- **Upward traversal**: The system searches upward from the current working directory for the nearest `scope.json`
- **No scope means all open**: When no scope is found, all commands are displayed
- **`--all` bypass**: `websculpt command list --all` temporarily ignores scope filtering

## Command Reference

### `scope init`

Initialize a scope in the current directory, creating `.websculpt/scope.json` (whitelist starts empty).

```bash
websculpt scope init
```

### `scope show`

Display the active scope configuration. Traverses upward from the current directory to find the nearest `scope.json`, then shows the whitelist and the availability status of each command.

```bash
websculpt scope show
```

Returns a prompt indicating all commands are visible when no scope is configured.

### `scope add <identifier>`

Add a command to the active scope whitelist.

```bash
websculpt scope add <identifier>
```

`identifier` supports two forms:

- `domain/action`: Add a single command, e.g. `github/list-trending`
- `domain`: Bulk-add all existing commands in that domain, e.g. `github`

### `scope remove <identifier>`

Remove a command from the active scope whitelist.

```bash
websculpt scope remove <identifier>
```

Supports `domain/action` for precise removal, or `domain` to bulk-remove all commands in that domain.

### `scope destroy`

Destroy the scope in the current directory, removing `.websculpt/scope.json`. Does not affect ancestor scopes.

```bash
websculpt scope destroy
```

## Relationship with Capture

After `capture finalize` installs a new command, it automatically appends the command to the nearest active scope whitelist (best-effort; failure does not block installation). Therefore, commands captured through the capture workflow usually enter the current project's view automatically.

## Typical Scenarios

| Scenario | Operation |
|------|------|
| Starting a new project and wanting to keep only relevant commands | `scope init` + `scope add <relevant commands>` |
| Command library bloated, current project view too noisy | `scope show` to diagnose → `scope remove <irrelevant commands>` |
| Need to view the global command library (bypassing scope filtering) | `websculpt command list --all` |
