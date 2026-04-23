import { access, copyFile, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import type { MetaCommandResult } from "../output.js";
import { validateCommandPackage } from "./command-validation.js";

const RESERVED_DOMAINS = new Set(["command", "config"]);

function resolveEntryFile(runtime: string | undefined): string {
	switch (runtime) {
		case "shell":
			return "command.sh";
		case "python":
			return "command.py";
		default:
			return "command.js";
	}
}

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

		// Read manifest.json from source directory
		let rawManifest: string;
		try {
			rawManifest = await readFile(join(sourceDir, "manifest.json"), "utf-8");
		} catch {
			return {
				success: false,
				error: { code: "FILE_NOT_FOUND", message: `Cannot read manifest.json from: ${sourceDir}` },
			};
		}

		let manifest: CommandManifest;
		try {
			manifest = JSON.parse(rawManifest) as CommandManifest;
		} catch {
			return {
				success: false,
				error: { code: "PARSE_ERROR", message: "Invalid JSON in manifest.json" },
			};
		}

		// Determine entry file and verify it exists
		const normalizedRuntime = manifest.runtime || "node";
		const entryFile = resolveEntryFile(normalizedRuntime);
		let code: string;
		try {
			code = await readFile(join(sourceDir, entryFile), "utf-8");
		} catch {
			return {
				success: false,
				error: {
					code: "INVALID_PACKAGE",
					message: `Entry file "${entryFile}" not found in source directory`,
				},
			};
		}

		// Check auxiliary file presence
		let hasReadme = false;
		let hasContext = false;
		try {
			await access(join(sourceDir, "README.md"));
			hasReadme = true;
		} catch {
			// README.md not present
		}
		try {
			await access(join(sourceDir, "context.md"));
			hasContext = true;
		} catch {
			// context.md not present
		}

		// Run shared validation layer
		const details = validateCommandPackage({
			manifest,
			code,
			hasReadme,
			hasContext,
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
		if (hasContext) {
			const contextContent = await readFile(join(sourceDir, "context.md"), "utf-8");
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

		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "CREATE_ERROR", message },
		};
	}
}
