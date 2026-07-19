---
name: websculpt
description: Setup and bootstrap entry point for WebSculpt. Use when you need to acquire or verify external information, scrape web pages, call APIs, perform browser automation, or use the WebSculpt command library, and the websculpt command is unavailable (not installed or broken) in the current environment — you must complete setup through this skill before acquiring information. Also use when the user explicitly asks to install, update, or repair WebSculpt. If the websculpt command is already available, use the lifecycle skills (websculpt-explore, websculpt-capture, websculpt-maintain, websculpt-library) directly instead of loading this skill.
---

# WebSculpt Bootstrap

## Role

This skill is the WebSculpt bootstrapper, not an information-gathering tool. It plays three time-phased roles:

1. **Installer** (first trigger): check the environment, install the WebSculpt CLI and the four lifecycle skills (explore / capture / maintain / library).
2. **Stand-in router** (remainder of the installing session): newly installed skills are not yet in the host's skill listing. You must read the corresponding installed skill file and follow its protocol to continue the user's task.
3. **Dormant recovery entry** (all later sessions): this skill should not trigger anymore — the lifecycle skills are in place. It wakes only when WebSculpt is broken (e.g. `websculpt: command not found`) or the user explicitly asks to install / update / repair it.

## Step 1: Probe

Always probe before acting; never install blindly:

```bash
websculpt --version
```

- Command not found → proceed to "Install".
- Command works → run `websculpt skill status`. This command has no exit-code semantics — judge by its output text: each skill line reports `installed local`, `installed global`, or `not installed`.
  - All four lifecycle skills report `installed local` or `installed global`, and the user has no install / update / repair intent → go straight to "Route"; do not reinstall.
  - Any skill reports `not installed` → run `npm install -g @playwright/cli@0.1.13` and step 3 of "Install" (install the lifecycle skills), then go to "Route".
- The user explicitly asks to update / repair → go to "Update and Repair".

## Install

### 1. Check Node.js

```bash
node --version
```

Node.js >= 22 is required. If not met, tell the user to install Node.js 22 or later and stop.

### 2. Install the CLI and the browser tool

```bash
npm install -g @playwright/cli@0.1.13 websculpt
```

`@playwright/cli` is the browser-automation dependency used during explore; install it together with the CLI.

If the global install fails due to permissions (e.g. EACCES), do not use sudo — sudo does not exist on Windows, and a sudo install leaves root-owned files in the npm global directory, breaking every later npm operation with permission errors. Use the npx fallback instead: prefix every subsequent `websculpt` command with `npx -y websculpt@latest` and every `playwright-cli` command with `npx -y @playwright/cli@0.1.13` (including skill install and status below).

### 3. Install the lifecycle skills

```bash
websculpt skill install --global
```

This command is idempotent; existing skills are skipped. A global install writes to `.claude/skills/`, `.codex/skills/`, and `.agents/skills/` under the user's home directory — the host agent only needs to read one of them.

`--global` is the default here. If the user explicitly wants WebSculpt only inside one project, run `websculpt skill install` (without `--global`) in that project's root instead, which requires an existing `.claude/`, `.codex/`, or `.agents/` directory there.

### 4. Verify and report

```bash
websculpt skill status
```

Confirm all four lifecycle skills report `installed local` or `installed global`. Briefly report to the user: the CLI version, the skill install locations (scope and directories), and that future sessions will trigger these skills automatically.

## Route

Once installation is done (or the probe found everything ready), continue the user's original task:

1. Identify the task's stage: acquiring external information → `websculpt-explore`; solidifying a validated path into a command → `websculpt-capture`; fixing or iterating a broken command → `websculpt-maintain`; organizing / migrating the command library → `websculpt-library`. Most tasks start with explore.
2. Read the corresponding installed skill file and strictly follow its protocol. Locate it by the scope reported by `skill status`: `installed global` means `.agents/skills/<skill-name>/SKILL.md` under the user's home directory (identical copies exist under `.claude/skills/` and `.codex/skills/`); `installed local` means the same path under the current project directory.
3. Within this session, whenever any websculpt skill's protocol calls for loading another websculpt skill (e.g. explore suggesting capture), likewise read that skill's installed SKILL.md file instead of relying on host triggering.
4. Do not ask the user to restart the session or restate the task; take over yourself.

## Update and Repair

- Update: `npm update -g websculpt`, then `websculpt skill install --global --force` to refresh the skills so they stay in sync with the new CLI version.
- Repair: if the `websculpt` command is missing or broken, re-run the "Install" flow.
- If `skill install` / `skill status` fails with an unknown command or option, the CLI is outdated: run `npm update -g websculpt` first and retry.
- A broken individual command (a `domain/action`) is not this skill's responsibility; route it to websculpt-maintain.

## Prohibited

- Do not run any install command before probing (`websculpt --version` / `websculpt skill status`).
- Do not reinstall when the CLI and skills are already healthy, and do not ask the user to restart the session; route and continue the task directly.
- Do not use sudo to work around npm global install permission errors; use the npx fallback instead.
- Do not hand-edit the four installed lifecycle skill files; they are refreshed exclusively via `websculpt skill install --force`.
