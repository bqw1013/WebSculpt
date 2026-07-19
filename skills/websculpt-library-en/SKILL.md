---
name: websculpt-library
description: Organize, trim, or migrate your WebSculpt command library. Use scope to control what appears in `websculpt command list` (show only commands relevant to the current project), and use `command export` / `command import` to package and move commands between machines or teammates for backup or sharing. Useful when the command list feels cluttered, you want to focus on project-relevant commands, export all commands for backup, or import a shared command package.
---

# WebSculpt Library

## What it does

Library handles two common needs:

1. **Control what `command list` shows**: Use `scope` to maintain an allow-list that decides what `websculpt command list` and help display for the current project
2. **Move commands between installations**: Use `command export` / `command import` to package, share, or back up commands

> Important: `scope` only affects what `command list` **displays**. It does not affect execution. Commands outside the allow-list can still be run directly with `websculpt <domain> <action>`.

---

## 1. Control what `command list` shows (scope)

As your command library grows, `websculpt command list` can become crowded with commands that are not relevant to the current project. `scope` lets you maintain an allow-list in the project directory so only the commands you care about are shown.

### Basic usage

```bash
# Enable a scope in the current directory
websculpt scope init

# Add commands to the allow-list
websculpt scope add github/list-trending
websculpt scope add github          # bulk-add all installed commands in the github domain

# See what is currently active
websculpt scope show

# Remove commands from the allow-list
websculpt scope remove github/list-trending
websculpt scope remove github
```

### Key behaviors

- `scope` only changes what `websculpt command list`, `websculpt command domains`, and help **display**. It does not change whether a command exists or can be run. Commands outside the allow-list can still be executed directly.
- To temporarily see all commands, use `websculpt command list --all`.
- If the current directory has no scope, the nearest ancestor scope is used; if none exist, all commands are shown.
- `scope add` / `scope remove` accept an `identifier` of either `domain/action` (a single command) or `domain` (all existing commands in that domain).
- New commands installed via `capture finalize` are automatically added to the current project's scope.

### Disable a scope

```bash
# Remove the scope in the current directory
websculpt scope destroy
```

After removing it, an ancestor scope continues to apply if one exists; otherwise all commands become visible again.

---

## 2. Move commands between installations (export/import)

Use these commands when you want to share commands with teammates, move to a new machine, or create a backup. Commands are exported as a plain directory that can be shared however you like.

### Export

```bash
# Export all commands (default behavior)
websculpt command export --to ./my-commands

# Export specific commands or domains
websculpt command export github/list-trending --to ./my-commands
websculpt command export github --to ./my-commands  # export all commands in the github domain
```

**Key behaviors:**

- Omitting identifiers exports **all installed commands**.
- **Export does not filter by the current scope allow-list.** Even if a scope is enabled, omitting identifiers still exports every command, equivalent to `command list --all`. If you only want to export commands inside the current scope, review `scope show` and manually specify domains or `domain/action` identifiers.
- Export uses the effective command view (User overrides Builtin). Identifiers can be mixed and may be `domain` (all commands in that domain) or `domain/action` (a single command).
- If the target directory already exists and is not empty, use `--force` to clear it before writing.

### Import

```bash
# Import a package into the local library
websculpt command import --from ./my-commands

# Preview the import without writing anything
websculpt command import --from ./my-commands --dry-run

# Overwrite existing commands with the same name
websculpt command import --from ./my-commands --force
```

**Key behaviors:**

- By default, if a command with the same name already exists locally, it is **skipped**.
- `--force` overwrites existing commands. `--dry-run` reports what would be imported and any conflicts without modifying files.
- All commands in the package are validated before anything is written. If any command fails validation, the entire import aborts without writing files.

### Before sharing

If the exported package contains `evidence.md`, the export command emits an `EVIDENCE_INCLUDED` warning. Review the package before sharing it with others, as it may contain sensitive information.

---

## 3. Common scenarios

| Scenario | What to do |
|------|------|
| Start a new project and show only relevant commands | `scope init` → `scope add <commands you need>` |
| `command list` is too noisy | `scope show` to review → `scope remove <commands you do not need>` |
| Temporarily view all commands | `websculpt command list --all` |
| Quickly see available platforms | `websculpt command domains` |
| Back up all commands to a directory | `command export --to <dir>` |
| Export only commands in a specific domain | `command export <domain> --to <dir>` |
| Export only commands in the current scope | `scope show` to review the allow-list → manually `command export <domain> <domain/action>... --to <dir>` |
| Share commands with the team | `command export --to <dir>` |
| Install a package from the team | `command import --from <dir>` |
| Back up commands when moving to a new machine | `command export --to <dir>` → on the new machine: `command import --from <dir>` |
| Preview an import without writing | `command import --from <dir> --dry-run` |
| Overwrite existing commands during import | `command import --from <dir> --force` |
