import { access, constants, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { USER_COMMANDS_DIR } from "../../../infra/paths.js";
import { rebuildIndex } from "../../engine/command-discovery/index-persistence.js";
import type { CaptureRestoreResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { getCaptureWorkspacePath, readCaptureYaml } from "./lib/capture-io.js";

/**
 * Handles the `capture restore <workspace-name>` command.
 *
 * Restores the installed command to the snapshot recorded in the workspace's
 * `backup/` directory at import time.
 */
export async function handleCaptureRestore(name: string): Promise<MetaCommandResult> {
	const workspacePath = getCaptureWorkspacePath(name);

	// 1. Workspace existence check
	try {
		await access(join(workspacePath, "capture.yaml"), constants.F_OK);
	} catch {
		return {
			success: false,
			error: {
				code: "NOT_FOUND",
				message: `Capture workspace not found: ${workspacePath}`,
			},
		};
	}

	// 2. Read metadata and check sourceType
	const captureYaml = await readCaptureYaml(join(workspacePath, "capture.yaml"));
	if (captureYaml.sourceType === undefined) {
		return {
			success: false,
			error: {
				code: "WORKSPACE_NOT_RESTORABLE",
				message: `Workspace "${name}" was created before restore support and cannot be restored.`,
			},
		};
	}

	// 3. Check backup/ exists
	const backupDir = join(workspacePath, "backup");
	try {
		await access(backupDir, constants.F_OK);
	} catch {
		return {
			success: false,
			error: {
				code: "BACKUP_NOT_FOUND",
				message: `Backup directory not found in workspace "${name}". Cannot restore.`,
			},
		};
	}

	const { domain, action } = captureYaml;
	const targetDir = join(USER_COMMANDS_DIR, domain, action);

	// 4. Restore based on sourceType
	if (captureYaml.sourceType === "user") {
		// Remove existing target directory if present, then copy backup into it
		await rm(targetDir, { recursive: true, force: true });
		await cp(backupDir, targetDir, { recursive: true });
	} else {
		// Builtin: remove any user override so the builtin becomes effective again
		try {
			await access(targetDir, constants.F_OK);
			await rm(targetDir, { recursive: true, force: true });
		} catch {
			// Already absent — idempotent, nothing to do.
		}
	}

	// 5. Rebuild the command registry index
	try {
		await rebuildIndex();
	} catch {
		// Silent failure: next startup will rebuild the index.
	}

	const command = `${domain}/${action}`;
	const result: CaptureRestoreResult = {
		success: true,
		command,
		path: targetDir,
		sourceType: captureYaml.sourceType,
		next: `Restore complete. Verify the command with: websculpt ${domain} ${action}`,
	};
	return result;
}

/** Registers the `capture restore` sub-command on the capture command group. */
export function registerCaptureRestore(group: Command, format: () => "human" | "json"): void {
	group
		.command("restore <workspace-name>")
		.description("Restore an installed command from a capture workspace backup")
		.action(async (name: string) => {
			renderOutput(await handleCaptureRestore(name), format());
		});
}
