import { access, constants, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { handleCommandCreate } from "../command/create.js";
import { computeCaptureStatus } from "./lib/capture-status-computer.js";
import {
	computeCaptureDraftFingerprint,
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	readCaptureYaml,
} from "./lib/capture-utils.js";
import { auditEvidence } from "./lib/evidence-audit.js";

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

	// Hard gate 1: validation.json must exist and report success.
	const validationPath = join(workspacePath, "validation.json");
	let validationRecord: { draftFingerprint?: unknown; success?: unknown };
	try {
		const validationContent = await readFile(validationPath, "utf8");
		validationRecord = JSON.parse(validationContent) as { draftFingerprint?: unknown; success?: unknown };
	} catch {
		return {
			success: false,
			error: {
				code: "VALIDATION_NOT_FOUND",
				message: "No validation result found. Run `capture validate` first.",
			},
		};
	}

	if (validationRecord.success !== true) {
		return {
			success: false,
			error: {
				code: "VALIDATION_FAILED",
				message: "Last validation failed. Fix issues and run `capture validate` again.",
			},
		};
	}

	if (validationRecord.draftFingerprint !== (await computeCaptureDraftFingerprint(name, captureYaml))) {
		return {
			success: false,
			error: {
				code: "VALIDATION_STALE",
				message: "Draft files changed after the last successful validation. Run `capture validate` again.",
			},
		};
	}

	// Hard gate 2: evidence audit must pass.
	const evidenceContent = await readFile(join(workspacePath, "evidence.md"), "utf8");
	const audit = auditEvidence(evidenceContent, captureYaml.runtime);

	if (!audit.passed) {
		const parts: string[] = [];
		if (audit.missingHeadings.length > 0) {
			parts.push(`Missing headings: ${audit.missingHeadings.join(", ")}`);
		}
		if (audit.emptyHeadings.length > 0) {
			parts.push(`Empty headings: ${audit.emptyHeadings.join(", ")}`);
		}
		return {
			success: false,
			error: {
				code: "EVIDENCE_NOT_READY",
				message: `Evidence audit failed: ${parts.join("; ")}`,
			},
		};
	}

	const status = await computeCaptureStatus(name);
	if (!status.readyToFinalize) {
		return {
			success: false,
			error: {
				code: "DRAFT_NOT_READY",
				message: `Capture is not ready to finalize. Next action: ${status.nextAction}.`,
			},
		};
	}

	// Install via command create.
	const draftPath = getCaptureDraftPath(name);
	return await handleCommandCreate(captureYaml.domain, captureYaml.action, {
		fromDir: draftPath,
		force: options.force ?? captureYaml.commandLibrarySnapshot.conflictSource === "user",
	});
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
