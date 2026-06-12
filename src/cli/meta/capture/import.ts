import { access, constants, copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { scanAllCommands } from "../../engine/command-discovery/scanner.js";
import type { CaptureImportResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { resolveEntryFile } from "../../runtime/index.js";
import { computeCaptureDraftFingerprint } from "./lib/capture-draft.js";
import {
	type CaptureYaml,
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	scanCommandLibrarySnapshot,
	writeCaptureYaml,
	writeValidationRecord,
} from "./lib/capture-io.js";

const VALID_CAPTURE_NAME = /^[a-z0-9-]+$/;

/** Options accepted by the `capture import` command handler. */
export interface CaptureImportOptions {
	name?: string;
}

/**
 * Resolves an installed command by domain and action, preferring user over builtin.
 */
async function resolveInstalledCommand(domain: string, action: string) {
	const commands = await scanAllCommands();
	const userMatch = commands.find(
		(c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "user",
	);
	if (userMatch) {
		return userMatch;
	}
	const builtinMatch = commands.find(
		(c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "builtin",
	);
	return builtinMatch;
}

/**
 * Generates a default workspace name: `<domain>-<action>-<YYMMDD>`.
 * Appends incremental suffix (`-1`, `-2`) on collision.
 */
async function generateWorkspaceName(domain: string, action: string): Promise<string> {
	const now = new Date();
	const yy = String(now.getFullYear()).slice(2);
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	const baseName = `${domain}-${action}-${yy}${mm}${dd}`;

	let candidate = baseName;
	let suffix = 0;
	while (true) {
		const workspacePath = getCaptureWorkspacePath(candidate);
		try {
			await access(workspacePath, constants.F_OK);
			suffix += 1;
			candidate = `${baseName}-${suffix}`;
		} catch {
			return candidate;
		}
	}
}

/**
 * Handles the `capture import <domain> <action>` command.
 *
 * Creates a capture workspace from an installed command's artifacts,
 * synthesizing a validation record so the workspace starts in a fully
 * `done` state.
 */
export async function handleCaptureImport(
	domain: string,
	action: string,
	options: CaptureImportOptions,
): Promise<MetaCommandResult> {
	try {
		const command = await resolveInstalledCommand(domain, action);
		if (!command) {
			return {
				success: false,
				error: {
					code: "NOT_FOUND",
					message: `Command not found: ${domain}/${action}`,
				},
			};
		}

		const commandDir = dirname(command.commandPath);
		const evidencePath = join(commandDir, "evidence.md");
		try {
			await access(evidencePath, constants.F_OK);
		} catch {
			return {
				success: false,
				error: {
					code: "EVIDENCE_MISSING",
					message: `Installed command ${domain}/${action} is missing evidence.md and cannot be imported.`,
				},
			};
		}

		let name: string;
		if (options.name) {
			if (!VALID_CAPTURE_NAME.test(options.name)) {
				return {
					success: false,
					error: {
						code: "INVALID_CAPTURE_NAME",
						message: `Capture name "${options.name}" must match ^[a-z0-9-]+$`,
					},
				};
			}
			const workspacePath = getCaptureWorkspacePath(options.name);
			try {
				await access(workspacePath, constants.F_OK);
				return {
					success: false,
					error: {
						code: "ALREADY_EXISTS",
						message: `Capture workspace already exists: ${workspacePath}`,
					},
				};
			} catch {
				// workspace does not exist, safe to use
			}
			name = options.name;
		} else {
			name = await generateWorkspaceName(domain, action);
		}

		const workspacePath = getCaptureWorkspacePath(name);
		const draftPath = getCaptureDraftPath(name);
		const runtime = command.runtime;
		const entryFile = resolveEntryFile(runtime);

		await mkdir(draftPath, { recursive: true });

		// Copy draft files from installed command
		await copyFile(join(commandDir, "manifest.json"), join(draftPath, "manifest.json"));
		await copyFile(join(commandDir, entryFile), join(draftPath, entryFile));
		await copyFile(join(commandDir, "README.md"), join(draftPath, "README.md"));

		// Copy or create context.md
		try {
			await copyFile(join(commandDir, "context.md"), join(draftPath, "context.md"));
		} catch {
			await writeFile(join(draftPath, "context.md"), "", "utf8");
		}

		// Copy evidence.md to workspace root
		await copyFile(evidencePath, join(workspacePath, "evidence.md"));

		// Record source type and create backup snapshot
		const sourceType: "user" | "builtin" = command.source as "user" | "builtin";
		const backupDir = join(workspacePath, "backup");
		await cp(commandDir, backupDir, { recursive: true });

		// Generate capture.yaml
		const commandLibrarySnapshot = await scanCommandLibrarySnapshot(domain, action);
		const metadata: CaptureYaml = {
			name,
			domain,
			action,
			runtime,
			createdAt: new Date().toISOString(),
			schema: "command-capture",
			commandLibrarySnapshot,
			repairOf: null,
			sourceCommand: `${domain}/${action}`,
			sourceType,
			supersedes: null,
		};
		await writeCaptureYaml(join(workspacePath, "capture.yaml"), metadata);

		// Generate synthetic validation.json with computed fingerprint
		const fingerprint = await computeCaptureDraftFingerprint(name, metadata);
		await writeValidationRecord(workspacePath, {
			success: true,
			draftFingerprint: fingerprint,
			timestamp: new Date().toISOString(),
		});

		const result: CaptureImportResult = {
			success: true,
			capture: {
				name,
				path: workspacePath,
				domain,
				action,
				runtime,
			},
			importedFrom: `${domain}/${action}`,
			next: "Workspace ready. Edit draft files, then follow the standard capture cycle: capture status → capture validate → capture status → capture finalize --force.",
		};
		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "CAPTURE_IMPORT_ERROR", message },
		};
	}
}

/** Registers the `capture import` sub-command on the capture command group. */
export function registerCaptureImport(group: Command, format: () => "human" | "json"): void {
	group
		.command("import <domain> <action>")
		.description("Import an installed command into a capture workspace")
		.option("--name <name>", "Custom workspace name")
		.action(async (domain: string, action: string, options: CaptureImportOptions) => {
			renderOutput(await handleCaptureImport(domain, action, options), format());
		});
}
