import { access, constants, copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { findScope, readScope, writeScope } from "../../engine/scope.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { handleCommandCreate } from "../command/create.js";
import { getCaptureDraftPath, getCaptureWorkspacePath, readCaptureYaml } from "./lib/capture-io.js";
import { type CaptureStatusData, computeCaptureStatus } from "./lib/capture-state.js";

/** Options accepted by the `capture finalize` command handler. */
export interface CaptureFinalizeOptions {
	force?: boolean;
}

/**
 * Handles the `capture finalize <name>` command.
 *
 * Performs hard-gated installation: requires a passing validation result
 * and a passing evidence audit before copying the draft to the user command
 * library via `command create`.
 */
export async function handleCaptureFinalize(
	name: string,
	options: CaptureFinalizeOptions = {},
): Promise<MetaCommandResult> {
	const workspacePath = getCaptureWorkspacePath(name);
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

	const captureYaml = await readCaptureYaml(join(workspacePath, "capture.yaml"));
	const status = await computeCaptureStatus(name);

	if (!status.readyToFinalize) {
		const error = buildFinalizeError(status);
		return {
			success: false,
			error,
		};
	}

	// Install via command create.
	const draftPath = getCaptureDraftPath(name);
	const createResult = await handleCommandCreate(captureYaml.domain, captureYaml.action, {
		fromDir: draftPath,
		force: options.force ?? captureYaml.commandLibrarySnapshot.conflictSource === "user",
	});

	// Copy evidence.md into the installed command directory so it is preserved
	// when the capture workspace is later cleaned up.
	if (createResult.success && "path" in createResult && typeof createResult.path === "string") {
		try {
			await copyFile(join(workspacePath, "evidence.md"), join(createResult.path, "evidence.md"));
		} catch {
			// Best-effort copy; the command is already correctly installed.
		}
	}

	// Auto-append the newly created command to the nearest active scope.
	if (createResult.success) {
		const scopePath = findScope(process.cwd());
		if (scopePath) {
			try {
				const scope = await readScope(scopePath);
				const identifier = `${captureYaml.domain}/${captureYaml.action}`;
				if (!scope.config.commands.includes(identifier)) {
					scope.config.commands.push(identifier);
					await writeScope(scopePath, scope.config);
				}
			} catch {
				// Best-effort scope update; do not fail finalization.
			}
		}
	}

	return createResult;
}

/** Maps artifact states from the state machine to CLI finalize error codes. */
function buildFinalizeError(status: CaptureStatusData): { code: string; message: string } {
	const { artifacts } = status;

	if (artifacts.validation.status !== "done") {
		const detail = artifacts.validation.detail;
		if (detail?.lastResult === "failed") {
			return {
				code: "VALIDATION_FAILED",
				message: "Last validation failed. Fix issues and run `capture validate` again.",
			};
		}
		if (detail?.lastResult === "stale") {
			return {
				code: "VALIDATION_STALE",
				message: "Draft files changed after the last successful validation. Run `capture validate` again.",
			};
		}
		// When validation is blocked only because other draft artifacts are incomplete,
		// surface the underlying artifact issue rather than a validation error.
		if (artifacts.validation.reason !== "Draft artifacts are not complete") {
			return {
				code: "VALIDATION_NOT_FOUND",
				message: artifacts.validation.reason ?? "No validation result found. Run `capture validate` first.",
			};
		}
	}

	if (artifacts.evidence.status !== "done") {
		return {
			code: "EVIDENCE_NOT_READY",
			message: `Evidence audit failed: ${artifacts.evidence.reason ?? ""}`,
		};
	}

	return {
		code: "DRAFT_NOT_READY",
		message: `Capture is not ready to finalize. Next action: ${status.nextAction}.`,
	};
}

/** Registers the `capture finalize` sub-command. */
export function registerCaptureFinalize(group: Command, format: () => "human" | "json"): void {
	group
		.command("finalize <name>")
		.description("Finalize a capture workspace and install the command")
		.option("--force", "Overwrite an existing user command")
		.action(async (name: string, options: CaptureFinalizeOptions) => {
			renderOutput(await handleCaptureFinalize(name, options), format());
		});
}
