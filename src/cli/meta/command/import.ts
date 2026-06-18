import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { USER_COMMANDS_DIR } from "../../../infra/paths.js";
import type { CommandManifest, ValidationDetail } from "../../../types/index.js";
import { rebuildIndex } from "../../engine/command-discovery/index-persistence.js";
import { RESERVED_DOMAINS } from "../../engine/contract.js";
import type { CommandImportResult } from "../../output/types.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { isLoadError, loadCommandSource } from "../lib/command-source-loader.js";
import { validateCommandSource } from "../lib/command-validation.js";

/** Shape of the optional index.json in an export package. */
interface ExportIndex {
	commands: string[];
}

/**
 * Discovers commands in a package directory by scanning `<dir>/commands/`.
 *
 * Returns a sorted array of `<domain>/<action>` identifiers.
 */
async function discoverCommandsFromDir(commandsDir: string): Promise<string[]> {
	const result: string[] = [];
	try {
		const domainDirs = await readdir(commandsDir, { withFileTypes: true });
		for (const domainDir of domainDirs) {
			if (!domainDir.isDirectory()) continue;
			const domainPath = join(commandsDir, domainDir.name);
			const actionDirs = await readdir(domainPath, { withFileTypes: true });
			for (const actionDir of actionDirs) {
				if (!actionDir.isDirectory()) continue;
				// Verify this directory has a manifest.json
				try {
					await access(join(domainPath, actionDir.name, "manifest.json"));
					result.push(`${domainDir.name}/${actionDir.name}`);
				} catch {
					// Skip directories without manifest.json
				}
			}
		}
	} catch {
		// Commands directory may not exist or may not be readable
	}
	result.sort();
	return result;
}

/**
 * Loads the export index from `<dir>/index.json` if it exists.
 * Returns null if the file is missing or invalid.
 */
async function readExportIndex(fromDir: string): Promise<ExportIndex | null> {
	try {
		const raw = await readFile(join(fromDir, "index.json"), "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"commands" in parsed &&
			Array.isArray((parsed as ExportIndex).commands)
		) {
			return parsed as ExportIndex;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Splits a `<domain>/<action>` identifier into its parts.
 * Returns null if the identifier does not contain exactly one slash.
 */
function splitCommandId(cmdId: string): { domain: string; action: string } | null {
	const slashIdx = cmdId.indexOf("/");
	if (slashIdx <= 0 || slashIdx === cmdId.length - 1) {
		return null;
	}
	return {
		domain: cmdId.slice(0, slashIdx),
		action: cmdId.slice(slashIdx + 1),
	};
}

/**
 * Validates all commands in the package before any writes.
 *
 * Each command is loaded from its directory under `<fromDir>/commands/<domain>/<action>/`,
 * then run through the shared L1–L3 validation layer using its own manifest's domain/action
 * as the expected identity.
 *
 * Returns a map of command identifier → validation details, keyed only for commands
 * that have errors. Warning-only commands are not included.
 */
async function validateImportPackage(fromDir: string): Promise<{
	valid: string[];
	errors: Map<string, ValidationDetail[]>;
}> {
	const commandsDir = join(fromDir, "commands");
	const discovered = await discoverCommandsFromDir(commandsDir);

	const valid: string[] = [];
	const errors = new Map<string, ValidationDetail[]>();

	for (const cmdId of discovered) {
		const parts = splitCommandId(cmdId);
		if (!parts) continue;
		const { domain, action } = parts;
		const cmdDir = join(commandsDir, domain, action);

		// Check reserved domains
		if (RESERVED_DOMAINS.has(domain)) {
			errors.set(cmdId, [
				{
					code: "RESERVED_DOMAIN",
					message: `Domain "${domain}" is reserved for meta commands`,
					level: "error",
				},
			]);
			continue;
		}

		const loaded = await loadCommandSource(cmdDir);
		if (isLoadError(loaded)) {
			errors.set(cmdId, [
				{
					code: loaded.error.code,
					message: loaded.error.message,
					level: "error",
				},
			]);
			continue;
		}

		const manifest = loaded.manifest as CommandManifest;
		const details = validateCommandSource({
			manifest,
			code: loaded.code,
			hasReadme: loaded.hasReadme,
			hasContext: loaded.hasContext,
			readmeContent: loaded.readmeContent,
			contextContent: loaded.contextContent,
			expectedDomain: domain,
			expectedAction: action,
		});

		const errorDetails = details.filter((d) => d.level === "error");
		if (errorDetails.length > 0) {
			errors.set(cmdId, errorDetails);
		} else {
			valid.push(cmdId);
		}
	}

	return { valid, errors };
}

/** Result of installing a single command from the import package. */
interface InstallEntry {
	command: string;
	status: "installed" | "overwritten" | "skipped";
}

/**
 * Imports commands from an export package into the local user command library.
 *
 * Flow:
 * 1. Validate the package structure (commands dir must exist, index.json consistency).
 * 2. Validate every command (L1–L3). Abort if any fail.
 * 3. Install each valid command, respecting --force and --dry-run.
 */
export async function handleCommandImport(options: {
	from: string;
	force?: boolean;
	dryRun?: boolean;
}): Promise<MetaCommandResult> {
	try {
		const fromDir = options.from;
		const commandsDir = join(fromDir, "commands");

		// Check that commands/ directory exists
		let hasCommandsDir = false;
		try {
			await access(commandsDir);
			hasCommandsDir = true;
		} catch {
			// Missing
		}

		if (!hasCommandsDir) {
			return {
				success: false,
				error: {
					code: "MISSING_COMMANDS_DIR",
					message: `Directory "${commandsDir}" does not exist. Expected a "commands/" directory inside the export package.`,
				},
			};
		}

		// Discover commands
		const discovered = await discoverCommandsFromDir(commandsDir);

		// Check index.json consistency if present
		const index = await readExportIndex(fromDir);
		if (index) {
			const indexSet = new Set(index.commands);
			const diskSet = new Set(discovered);
			const mismatch =
				indexSet.size !== diskSet.size ||
				[...indexSet].some((c) => !diskSet.has(c)) ||
				[...diskSet].some((c) => !indexSet.has(c));
			if (mismatch) {
				return {
					success: false,
					error: {
						code: "INDEX_MISMATCH",
						message: "The index.json commands list does not match the on-disk command directories.",
					},
				};
			}
		}

		if (discovered.length === 0) {
			return {
				success: false,
				error: {
					code: "NO_COMMANDS_FOUND",
					message: `No valid command directories found under "${commandsDir}".`,
				},
			};
		}

		// Validate all commands before any writes
		const { valid, errors } = await validateImportPackage(fromDir);

		if (errors.size > 0) {
			const perCommandDetails: Record<string, ValidationDetail[]> = {};
			for (const [cmdId, details] of errors) {
				perCommandDetails[cmdId] = details;
			}
			const result: MetaCommandResult = {
				success: false,
				error: {
					code: "VALIDATION_ERROR",
					message: `Validation failed for ${errors.size} command(s)`,
					details: [...errors.values()].flat(),
				},
			};
			// Attach per-command grouping for JSON consumers.
			(result as unknown as Record<string, unknown>).perCommandDetails = perCommandDetails;
			return result;
		}

		// Install commands (or simulate for dry-run)
		const results: InstallEntry[] = [];

		for (const cmdId of valid) {
			const parts = splitCommandId(cmdId);
			if (!parts) continue;
			const { domain, action } = parts;
			const sourceCmdDir = join(commandsDir, domain, action);
			const targetCmdDir = join(USER_COMMANDS_DIR, domain, action);

			// Check if target already exists
			let exists = false;
			try {
				await access(targetCmdDir);
				exists = true;
			} catch {
				// Does not exist
			}

			if (exists && !options.force) {
				results.push({ command: cmdId, status: "skipped" });
				continue;
			}

			if (options.dryRun) {
				results.push({ command: cmdId, status: exists ? "overwritten" : "installed" });
				continue;
			}

			// Write the command
			if (exists) {
				// Remove existing before overwriting
				await rm(targetCmdDir, { recursive: true, force: true });
			}
			await mkdir(targetCmdDir, { recursive: true });

			// Copy all files from the source command directory
			const dirEntries = await readdir(sourceCmdDir, { withFileTypes: true });
			for (const entry of dirEntries) {
				if (!entry.isFile()) continue;
				const sourcePath = join(sourceCmdDir, entry.name);
				const targetPath = join(targetCmdDir, entry.name);
				await writeFile(targetPath, await readFile(sourcePath));
			}

			results.push({ command: cmdId, status: exists ? "overwritten" : "installed" });
		}

		// Rebuild index (unless dry-run)
		if (!options.dryRun) {
			try {
				await rebuildIndex();
			} catch {
				// Silent failure: next startup will rebuild the index.
			}
		}

		const result: CommandImportResult = {
			success: true,
			results,
		};

		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "IMPORT_ERROR", message },
		};
	}
}

/** Registers the `import` sub-command on the given command group. */
export function registerImport(group: Command, format: () => "human" | "json"): void {
	group
		.command("import")
		.description("Import commands from a portable directory package")
		.requiredOption("--from <dir>", "Path to the export package directory")
		.option("--force", "Overwrite existing user commands")
		.option("--dry-run", "Validate and report without writing any files")
		.action(async (options: { from: string; force?: boolean; dryRun?: boolean }) => {
			renderOutput(await handleCommandImport(options), format());
		});
}
