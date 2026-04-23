import { access, copyFile, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import type { MetaCommandResult } from "../output.js";

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

function validateManifestFromFile(manifest: unknown, expectedDomain: string, expectedAction: string): string | null {
	if (!manifest || typeof manifest !== "object") {
		return "Manifest must be an object";
	}
	const m = manifest as Record<string, unknown>;
	if (typeof m.id !== "string" || m.id.trim().length === 0) {
		return "Manifest must have a non-empty 'id' string";
	}
	if (m.domain !== expectedDomain) {
		return `Manifest domain "${m.domain}" does not match CLI argument "${expectedDomain}"`;
	}
	if (m.action !== expectedAction) {
		return `Manifest action "${m.action}" does not match CLI argument "${expectedAction}"`;
	}
	if (m.parameters !== undefined && !Array.isArray(m.parameters)) {
		return "Manifest 'parameters' must be an array of objects if provided";
	}
	if (m.runtime !== undefined && typeof m.runtime !== "string") {
		return "Manifest 'runtime' must be a string if provided";
	}
	return null;
}

/**
 * Creates a new user-defined command from a source directory.
 * Reads manifest.json, entry file, README.md and context.md from the source directory
 * and installs them into ~/.websculpt/commands/<domain>/<action>/.
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

		const validationError = validateManifestFromFile(manifest, domain, action);
		if (validationError) {
			return {
				success: false,
				error: { code: "INVALID_MANIFEST", message: validationError },
			};
		}

		// Determine entry file and verify it exists
		const normalizedRuntime = manifest.runtime || "node";
		const entryFile = resolveEntryFile(normalizedRuntime);
		try {
			await access(join(sourceDir, entryFile));
		} catch {
			return {
				success: false,
				error: {
					code: "INVALID_PACKAGE",
					message: `Entry file "${entryFile}" not found in source directory`,
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
			runtime: normalizedRuntime,
		};
		await writeFile(join(commandDir, "manifest.json"), JSON.stringify(normalizedManifest, null, 2));

		// Copy entry file
		await copyFile(join(sourceDir, entryFile), join(commandDir, entryFile));

		// Copy README.md if present
		try {
			await access(join(sourceDir, "README.md"));
			await copyFile(join(sourceDir, "README.md"), join(commandDir, "README.md"));
		} catch {
			// README.md not present, skip
		}

		// Copy context.md if present (store as plain string, no JSON wrapping)
		try {
			await access(join(sourceDir, "context.md"));
			const contextContent = await readFile(join(sourceDir, "context.md"), "utf-8");
			await writeFile(join(commandDir, "context.md"), contextContent);
		} catch {
			// context.md not present, skip
		}

		return {
			success: true,
			command: `${domain}/${action}`,
			path: commandDir,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "CREATE_ERROR", message },
		};
	}
}
