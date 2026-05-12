import { access, constants, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { CommandRuntime, ValidationDetail } from "../../../types/index.js";
import { RESERVED_DOMAINS } from "../../engine/contract.js";
import type { CaptureNewResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { isExecutable, normalizeRuntime } from "../../runtime/index.js";
import { generateEvidenceTemplate, writeDraftSkeleton } from "./lib/capture-draft.js";
import {
	type CaptureYaml,
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	scanCommandLibrarySnapshot,
	writeCaptureYaml,
} from "./lib/capture-io.js";

const VALID_CAPTURE_NAME = /^[a-z0-9-]+$/;

/** Options accepted by the `capture new` command handler. */
export interface CaptureNewOptions {
	domain?: string;
	action?: string;
	runtime?: string;
	force?: boolean;
}

/**
 * Creates a capture workspace with metadata, evidence template, and draft skeleton.
 */
export async function handleCaptureNew(name: string, options: CaptureNewOptions): Promise<MetaCommandResult> {
	try {
		if (!VALID_CAPTURE_NAME.test(name)) {
			return {
				success: false,
				error: {
					code: "INVALID_CAPTURE_NAME",
					message: `Capture name "${name}" must match ^[a-z0-9-]+$`,
				},
			};
		}

		const domain = options.domain;
		const action = options.action;
		if (!domain || !action) {
			return {
				success: false,
				error: {
					code: "MISSING_REQUIRED_OPTION",
					message: "Both --domain and --action are required",
				},
			};
		}

		if (RESERVED_DOMAINS.has(domain)) {
			return {
				success: false,
				error: {
					code: "RESERVED_DOMAIN",
					message: `Domain "${domain}" is reserved for meta commands`,
				},
			};
		}

		const runtime = normalizeRuntime(options.runtime);
		const workspacePath = getCaptureWorkspacePath(name);
		const draftPath = getCaptureDraftPath(name);

		try {
			await access(workspacePath, constants.F_OK);
			if (!options.force) {
				return {
					success: false,
					error: {
						code: "CAPTURE_ALREADY_EXISTS",
						message: `Capture workspace already exists: ${workspacePath}. Use --force to overwrite.`,
					},
				};
			}
			await rm(workspacePath, { recursive: true, force: true });
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") {
				throw err;
			}
		}

		const commandLibrarySnapshot = await scanCommandLibrarySnapshot(domain, action);
		if (commandLibrarySnapshot.conflictSource === "user" && !options.force) {
			return {
				success: false,
				error: {
					code: "COMMAND_ALREADY_EXISTS",
					message: `User command "${domain}/${action}" already exists. Use --force to continue anyway.`,
				},
			};
		}

		const metadata: CaptureYaml = {
			name,
			domain,
			action,
			runtime,
			createdAt: new Date().toISOString(),
			schema: "command-capture",
			commandLibrarySnapshot,
			repairOf: null,
			sourceCommand: null,
			supersedes: null,
		};

		await mkdir(draftPath, { recursive: true });
		await writeCaptureYaml(join(workspacePath, "capture.yaml"), metadata);
		await writeFile(join(workspacePath, "evidence.md"), generateEvidenceTemplate(metadata), "utf8");
		await writeDraftSkeleton(draftPath, domain, action, runtime);

		const warnings = buildWarnings(commandLibrarySnapshot.conflictSource, runtime, domain, action);
		const duplicateWarning =
			commandLibrarySnapshot.conflictSource === "builtin"
				? `Builtin command "${domain}/${action}" exists; finalizing this capture would create a user override.`
				: undefined;
		const result: CaptureNewResult = {
			success: true,
			capture: {
				name,
				path: workspacePath,
				domain,
				action,
				runtime,
			},
			commandLibrarySnapshot,
			summary: {
				domain,
				action,
				duplicateWarning,
				estimatedSteps: 5,
			},
			next: `websculpt capture status ${name}`,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "CAPTURE_NEW_ERROR", message },
		};
	}
}

/** Registers the `capture new` sub-command on the capture command group. */
export function registerCaptureNew(group: Command, format: () => "human" | "json"): void {
	group
		.command("new <name>")
		.description("Create a capture workspace")
		.requiredOption("--domain <domain>", "Target command domain")
		.requiredOption("--action <action>", "Target command action")
		.requiredOption("--runtime <runtime>", "Runtime: node, browser, shell, python")
		.option("--force", "Overwrite an existing capture workspace and allow user command conflicts")
		.action(async (name: string, options: CaptureNewOptions) => {
			renderOutput(await handleCaptureNew(name, options), format());
		});
}

function buildWarnings(
	conflictSource: "user" | "builtin" | undefined,
	runtime: CommandRuntime,
	domain: string,
	action: string,
): ValidationDetail[] {
	const warnings: ValidationDetail[] = [];
	if (conflictSource === "builtin") {
		warnings.push({
			code: "BUILTIN_OVERRIDE",
			message: `Builtin command "${domain}/${action}" already exists; this capture can later become a user override.`,
			level: "warning",
		});
	}
	if (!isExecutable(runtime)) {
		warnings.push({
			code: "RUNTIME_NOT_EXECUTABLE",
			message: `The "${runtime}" runtime is not yet executable by the CLI. Only "node" and "browser" commands can be run at this time.`,
			level: "warning",
		});
	}
	return warnings;
}
