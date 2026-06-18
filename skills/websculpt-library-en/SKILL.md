---
name: websculpt-library
description: Use this skill when you want to organize your WebSculpt command library — either to control which commands appear in a project, or to package and move commands to another machine or teammate.
---

# WebSculpt Library

## What it does

Library handles two common needs:

1. **Control which commands are shown**: Use `scope` to decide what `command list` displays for the current project
2. **Move commands between installations**: Use `command export` / `command import` to package, share, or back up commands

---

## 1. Control which commands are shown (scope)

As your command library grows, `command list` can become crowded with commands that are not relevant to the current project. `scope` lets you maintain an allow-list in the project directory so only the commands you care about are shown.

### Basic usage

```bash
# Enable a scope in the current directory
websculpt scope init

# Add commands you need
websculpt scope add github/list-trending
websculpt scope add github          # bulk-add all installed commands in the github domain

# See what is currently active
websculpt scope show

# Remove commands you no longer need
websculpt scope remove github/list-trending
websculpt scope remove github
```

**Common things to know**:

- After enabling a scope, commands outside the allow-list do not appear in `command list` by default, but you can still run them directly.
- To temporarily see all commands, use `websculpt command list --all`.
- If the current directory has no scope, the nearest scope above it is used; if none exist, all commands are shown.
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

### Basic usage

```bash
# Export all commands
websculpt command export --to ./my-commands

# Export specific commands
websculpt command export github/list-trending --to ./my-commands

# Import into the local library
websculpt command import --from ./my-commands
```

### Handling import conflicts

- By default, if a command with the same name already exists locally, it is skipped.
- To overwrite existing commands, add `--force`.
- To preview what would be imported and whether any conflicts exist, add `--dry-run`.

```bash
# Preview the import without writing anything
websculpt command import --from ./my-commands --dry-run

# Overwrite existing commands
websculpt command import --from ./my-commands --force
```

### Before sharing

If the exported package contains `evidence.md`, the export command emits an `EVIDENCE_INCLUDED` warning. Review the package before sharing it with others, as it may contain sensitive information.

---

## 3. Common scenarios

| Scenario | What to do |
|------|------|
| Start a new project and show only relevant commands | `scope init` → `scope add <commands you need>` |
| Project view is too noisy | `scope show` to review → `scope remove <commands you do not need>` |
| Temporarily view all commands | `websculpt command list --all` |
| Share commands with the team | `command export --to <dir>` |
| Install a package from the team | `command import --from <dir>` |
| Back up commands when moving to a new machine | `command export --to <dir>` → on the new machine: `command import --from <dir>` |
| Preview an import without writing | `command import --from <dir> --dry-run` |
| Overwrite existing commands during import | `command import --from <dir> --force` |
