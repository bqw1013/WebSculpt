import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { computeCaptureStatus } from "./lib/capture-status-computer.js";
import { getCaptureWorkspacePath } from "./lib/capture-utils.js";

/**
 * Handles the `capture status <name>` command.
 *
 * Reads the capture workspace from disk, runs the pure-functional status
 * machine, and returns the current artifact states with the next action.
 */
export async function handleCaptureStatus(name: string): Promise<MetaCommandResult> {
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

	try {
		const status = await computeCaptureStatus(name);
		return {
			success: true,
			capture: {
				name,
				path: workspacePath,
			},
			artifacts: status.artifacts,
			readyToFinalize: status.readyToFinalize,
			next: {
				action: status.nextAction,
				target: status.nextTarget,
			},
			warnings: status.warnings,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "STATUS_ERROR", message },
		};
	}
}

/** Registers the `capture status` sub-command. */
export function registerCaptureStatus(group: Command, format: () => "human" | "json"): void {
	group
		.command("status <name>")
		.description("Show capture workspace status and next action")
		.action(async (name: string) => {
			renderOutput(await handleCaptureStatus(name), format());
		});
}
