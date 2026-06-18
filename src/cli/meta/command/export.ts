import { access, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Command } from "commander";
import type { ResolvedCommand } from "../../engine/contract.js";
import { listAllCommands } from "../../engine/registry.js";
import type { CommandExportResult } from "../../output/types.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";

/**
 * Resolves the set of commands to export from the given identifiers.
 *
 * - No identifiers → export all resolved commands (user-over-builtin priority,
 *   ignoring any active scope whitelist).
 * - `<domain>` → all resolved commands in that domain.
 * - `<domain>/<action>` → the single resolved command.
 * - Mixed identifiers → union of all matches.
 */
function resolveExportCommands(identifiers: string[]): ResolvedCommand[] {
	const all = listAllCommands();

	if (identifiers.length === 0) {
		return all;
	}

	const matched = new Map<string, ResolvedCommand>();

	for (const id of identifiers) {
		const slashIdx = id.indexOf("/");
		if (slashIdx === -1) {
			// Domain-only filter
			for (const cmd of all) {
				if (cmd.manifest.domain === id) {
					matched.set(`${cmd.manifest.domain}/${cmd.manifest.action}`, cmd);
				}
			}
		} else {
			// domain/action exact match
			const domain = id.slice(0, slashIdx);
			const action = id.slice(slashIdx + 1);
			for (const cmd of all) {
				if (cmd.manifest.domain === domain && cmd.manifest.action === action) {
					matched.set(`${domain}/${action}`, cmd);
					break;
				}
			}
		}
	}

	return [...matched.values()].sort((a, b) => {
		const d = a.manifest.domain.localeCompare(b.manifest.domain);
		if (d !== 0) return d;
		return a.manifest.action.localeCompare(b.manifest.action);
	});
}

/**
 * Checks whether a directory exists and is non-empty.
 * Returns true if the directory exists and contains at least one entry.
 */
async function isNonEmptyDir(dirPath: string): Promise<boolean> {
	try {
		const entries = await readdir(dirPath);
		return entries.length > 0;
	} catch {
		return false;
	}
}

/** Known asset files in a command directory that should be included in the export. */
const ASSET_FILES = ["README.md", "context.md", "evidence.md"];

/**
 * Exports resolved commands into a portable directory package.
 *
 * The export package structure:
 *   <toDir>/index.json            — command list
 *   <toDir>/commands/<domain>/<action>/ — per-command assets
 */
export async function handleCommandExport(
	identifiers: string[],
	options: { to: string; force?: boolean },
): Promise<MetaCommandResult> {
	try {
		const targetDir = options.to;

		// Check for non-empty target directory
		const nonEmpty = await isNonEmptyDir(targetDir);
		if (nonEmpty && !options.force) {
			return {
				success: false,
				error: {
					code: "DIRECTORY_NOT_EMPTY",
					message: `Target directory "${targetDir}" is not empty. Use --force to overwrite.`,
				},
			};
		}

		// Resolve commands to export
		const commands = resolveExportCommands(identifiers);

		if (commands.length === 0) {
			return {
				success: false,
				error: {
					code: "NO_COMMANDS_MATCHED",
					message: "No commands matched the given identifiers.",
				},
			};
		}

		// Prepare target directory
		if (nonEmpty && options.force) {
			// Remove existing contents so we can start fresh
			const entries = await readdir(targetDir);
			await Promise.all(entries.map((e) => rm(join(targetDir, e), { recursive: true, force: true })));
		}
		await mkdir(targetDir, { recursive: true });

		const commandsDir = join(targetDir, "commands");
		await mkdir(commandsDir, { recursive: true });

		const exportedCommands: string[] = [];
		let hasEvidence = false;

		// Copy each command's directory
		for (const cmd of commands) {
			const cmdKey = `${cmd.manifest.domain}/${cmd.manifest.action}`;
			exportedCommands.push(cmdKey);

			// The commandPath is the entry file; the command directory is its parent
			const sourceCmdDir = join(cmd.commandPath, "..");
			const targetCmdDir = join(commandsDir, cmd.manifest.domain, cmd.manifest.action);
			await mkdir(targetCmdDir, { recursive: true });

			// Copy manifest.json
			await copyFile(join(sourceCmdDir, "manifest.json"), join(targetCmdDir, "manifest.json"));

			// Copy the entry file (commandPath points to it)
			const entryFileName = basename(cmd.commandPath);
			await copyFile(cmd.commandPath, join(targetCmdDir, entryFileName));

			// Copy optional asset files
			for (const asset of ASSET_FILES) {
				const assetPath = join(sourceCmdDir, asset);
				try {
					await access(assetPath);
					await copyFile(assetPath, join(targetCmdDir, asset));
					if (asset === "evidence.md") {
						hasEvidence = true;
					}
				} catch {
					// Asset file not present, skip.
				}
			}
		}

		// Write index.json
		await writeFile(join(targetDir, "index.json"), JSON.stringify({ commands: exportedCommands }, null, 2));

		const result: CommandExportResult = {
			success: true,
			exported: exportedCommands,
			to: targetDir,
		};

		if (hasEvidence) {
			result.warnings = [
				{
					code: "EVIDENCE_INCLUDED",
					message:
						"One or more exported commands contain evidence.md. Review its contents before sharing the package.",
					level: "warning",
				},
			];
		}

		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "EXPORT_ERROR", message },
		};
	}
}

/** Registers the `export` sub-command on the given command group. */
export function registerExport(group: Command, format: () => "human" | "json"): void {
	group
		.command("export [identifiers...]")
		.description("Export resolved commands to a portable directory package")
		.requiredOption("--to <dir>", "Target directory for the export package")
		.option("--force", "Overwrite non-empty target directory")
		.action(async (identifiers: string[], options: { to: string; force?: boolean }) => {
			renderOutput(await handleCommandExport(identifiers, options), format());
		});
}
