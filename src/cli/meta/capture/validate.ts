import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { CommandValidateResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { handleCommandValidate } from "../command/validate.js";
import { computeCaptureDraftFingerprint, inspectCaptureDraftManifest } from "./lib/capture-draft.js";
import {
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	readCaptureYaml,
	writeValidationRecord,
} from "./lib/capture-io.js";

/**
 * Handles the `capture validate <name>` command.
 *
 * Wraps `command validate` for the draft directory and persists the result
 * to `validation.json` in the workspace root (success or failure).
 */
export async function handleCaptureValidate(name: string): Promise<MetaCommandResult> {
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
	const draftPath = getCaptureDraftPath(name);
	const result = await handleCommandValidate(draftPath, captureYaml.domain, captureYaml.action);
	const manifestInspection = await inspectCaptureDraftManifest(draftPath, captureYaml);
	const finalResult: MetaCommandResult =
		result.success && manifestInspection.mismatch !== undefined
			? {
					success: false,
					error: {
						code: "VALIDATION_ERROR",
						message: "Validation failed with 1 error(s)",
						details: [
							{
								code: "MANIFEST_MISMATCH",
								message: manifestInspection.mismatch.message,
								level: "error",
							},
						],
					},
				}
			: result;

	if (finalResult.success) {
		(finalResult as CommandValidateResult).message = "Next: capture finalize";
	}

	// Persist validation result so capture status can reference it.
	const validationRecord = {
		success: finalResult.success,
		draftFingerprint: await computeCaptureDraftFingerprint(name, captureYaml),
		timestamp: new Date().toISOString(),
		...(finalResult.success
			? { warnings: "warnings" in finalResult ? finalResult.warnings : undefined }
			: {
					errors:
						"error" in finalResult && "details" in finalResult.error && Array.isArray(finalResult.error.details)
							? finalResult.error.details
							: undefined,
				}),
	};

	await writeValidationRecord(workspacePath, validationRecord);

	return finalResult;
}

/** Registers the `capture validate` sub-command. */
export function registerCaptureValidate(group: Command, format: () => "human" | "json"): void {
	group
		.command("validate <name>")
		.description("Validate the draft command in a capture workspace")
		.action(async (name: string) => {
			renderOutput(await handleCaptureValidate(name), format());
		});
}
