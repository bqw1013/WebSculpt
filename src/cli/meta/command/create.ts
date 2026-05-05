import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { USER_COMMANDS_DIR } from "../../../infra/paths.js";
import { appendAuditLog } from "../../../infra/store.js";
import type { CommandManifest } from "../../../types/index.js";
import { RESERVED_DOMAINS, rebuildIndex } from "../../engine/registry.js";
import { resolveEntryFile } from "../../engine/runtime-meta.js";
import type { MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { isLoadError, loadCommandSource } from "../lib/command-source-loader.js";
import { validateCommandSource } from "../lib/command-validation.js";

/**
 * Creates a new user-defined command from a source directory.
 * Reads command assets from the source directory, validates them through the
 * shared L1-L3 validation layer, and installs them into
 * ~/.websculpt/commands/<domain>/<action>/.
 */
export async function handleCommandCreate(
	domain: string,
	action: string,
	options: { fromDir: string; force?: boolean },
): Promise<MetaCommandResult> {
	try {
		if (RESERVED_DOMAINS.has(domain)) {
			return {
				success: false,
				error: {
					code: "RESERVED_DOMAIN",
					message: `Domain "${domain}" is reserved for meta commands`,
				},
			};
		}

		const sourceDir = options.fromDir;

		const loaded = await loadCommandSource(sourceDir);
		if (isLoadError(loaded)) {
			return loaded;
		}
		const { manifest: rawManifest, code, hasReadme, hasContext, readmeContent, contextContent } = loaded;
		const manifest = rawManifest as CommandManifest;

		// Determine entry file and verify it exists
		const normalizedRuntime = manifest.runtime || "node";
		const entryFile = resolveEntryFile(normalizedRuntime);

		// Run shared validation layer
		const details = validateCommandSource({
			manifest,
			code,
			hasReadme,
			hasContext,
			readmeContent,
			contextContent,
			expectedDomain: domain,
			expectedAction: action,
		});

		const errors = details.filter((d) => d.level === "error");
		const warnings = details.filter((d) => d.level === "warning");

		if (errors.length > 0) {
			return {
				success: false,
				error: {
					code: "VALIDATION_ERROR",
					message: `Validation failed with ${errors.length} error(s)`,
					details: errors,
				},
			};
		}

		const commandDir = join(USER_COMMANDS_DIR, domain, action);

		// Check if command already exists
		let isOverwrite = false;
		try {
			await access(commandDir);
			if (!options.force) {
				return {
					success: false,
					error: {
						code: "ALREADY_EXISTS",
						message: `Command "${domain}/${action}" already exists. Use --force to overwrite.`,
					},
				};
			}
			isOverwrite = true;
			// Remove existing directory for overwrite
			await rm(commandDir, { recursive: true, force: true });
		} catch {
			// Directory does not exist, proceed.
		}

		await mkdir(commandDir, { recursive: true });

		// Write manifest.json with normalized runtime
		const normalizedManifest: CommandManifest = {
			...manifest,
			id: `${domain}-${action}`,
			domain,
			action,
			runtime: normalizedRuntime,
		};
		await writeFile(join(commandDir, "manifest.json"), JSON.stringify(normalizedManifest, null, 2));

		// Copy entry file
		await copyFile(join(sourceDir, entryFile), join(commandDir, entryFile));

		// Copy README.md if present
		if (hasReadme) {
			await copyFile(join(sourceDir, "README.md"), join(commandDir, "README.md"));
		}

		// Copy context.md if present
		if (hasContext && contextContent !== undefined) {
			await writeFile(join(commandDir, "context.md"), contextContent);
		}

		const result: MetaCommandResult = {
			success: true,
			command: `${domain}/${action}`,
			path: commandDir,
		};

		if (warnings.length > 0) {
			(result as unknown as Record<string, unknown>).warnings = warnings;
		}

		try {
			await appendAuditLog({
				timestamp: new Date().toISOString(),
				event: isOverwrite ? "overwrite" : "install",
				domain,
				action,
				sourcePath: sourceDir,
			});
		} catch {
			// Silent failure: audit log is best-effort.
		}

		try {
			await rebuildIndex();
		} catch {
			// Silent failure: next startup will rebuild the index.
		}

		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "CREATE_ERROR", message },
		};
	}
}

/** Registers the `create` sub-command on the given command group. */
export function registerCreate(group: Command, format: () => "human" | "json"): void {
	group
		.command("create <domain> <action>")
		.description("Create a user command from a directory")
		.requiredOption(
			"--from-dir <path>",
			"Path to the command source directory. Must contain manifest.json and the runtime-specific entry file.",
		)
		.option("--force", "Overwrite an existing command")
		.action(async (domain: string, action: string, options: { fromDir: string; force?: boolean }) => {
			renderOutput(await handleCommandCreate(domain, action, options), format());
		});
}
