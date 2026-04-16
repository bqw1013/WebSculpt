import { access, mkdir, readdir, readFile, rm, rmdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import { findCommand, listAllCommands } from "../engine/registry.js";
import type { MetaCommandResult } from "../output.js";

const RESERVED_DOMAINS = new Set(["command", "config"]);

/** Input shape expected from the --from-file payload. */
interface CommandPackage {
	manifest: CommandManifest;
	code: string;
	readme?: string;
	context?: string | Record<string, unknown>;
}

/** Lists all registered commands and returns them as a normalized result. */
export async function handleCommandList(): Promise<MetaCommandResult> {
	const commands = await listAllCommands();
	return {
		success: true,
		commands: commands.map((c) => ({
			domain: c.manifest.domain,
			action: c.manifest.action,
			type: c.source,
			id: c.manifest.id,
			description: c.manifest.description || "-",
		})),
	};
}

/** Displays details for a specific command. (Not implemented) */
export async function handleCommandShow(_domain: string, _action: string): Promise<MetaCommandResult> {
	return {
		success: false,
		error: {
			code: "NOT_IMPLEMENTED",
			message: "Command details are not implemented yet.",
		},
	};
}

/** Removes a user-defined command and returns a normalized result. */
export async function handleCommandRemove(domain: string, action: string): Promise<MetaCommandResult> {
	try {
		const resolved = await findCommand(domain, action);
		if (!resolved) {
			return {
				success: false,
				error: {
					code: "NOT_FOUND",
					message: `Command "${domain}/${action}" does not exist.`,
				},
			};
		}

		if (resolved.source === "builtin") {
			return {
				success: false,
				error: {
					code: "CANNOT_REMOVE_BUILTIN",
					message: `Built-in command "${domain}/${action}" cannot be removed.`,
				},
			};
		}

		const actionDir = dirname(resolved.commandPath);
		const domainDir = dirname(actionDir);

		await rm(actionDir, { recursive: true, force: true });

		// Best-effort cleanup of empty parent domain directory.
		try {
			const remaining = await readdir(domainDir);
			if (remaining.length === 0) {
				await rmdir(domainDir);
			}
		} catch {
			// Swallow cleanup errors; the command itself was successfully removed.
		}

		return {
			success: true,
			command: `${domain}/${action}`,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "REMOVE_ERROR", message },
		};
	}
}

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

function formatContext(context: string | Record<string, unknown>): string {
	if (typeof context === "string") {
		return context;
	}
	return `\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
}

function validateManifest(manifest: unknown, expectedDomain: string, expectedAction: string): string | null {
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
		return "Manifest 'parameters' must be an array of strings if provided";
	}
	if (m.runtime !== undefined && typeof m.runtime !== "string") {
		return "Manifest 'runtime' must be a string if provided";
	}
	return null;
}

/**
 * Creates a new user-defined command from a package file.
 * Writes manifest.json, command entry file, README.md and context.md.
 */
export async function handleCommandCreate(
	domain: string,
	action: string,
	options: { fromFile: string; force?: boolean },
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

		let raw: string;
		try {
			raw = await readFile(options.fromFile, "utf-8");
		} catch {
			return {
				success: false,
				error: { code: "FILE_NOT_FOUND", message: `Cannot read file: ${options.fromFile}` },
			};
		}

		let pkg: CommandPackage;
		try {
			pkg = JSON.parse(raw) as CommandPackage;
		} catch {
			return {
				success: false,
				error: { code: "PARSE_ERROR", message: `Invalid JSON in file: ${options.fromFile}` },
			};
		}

		if (!pkg.manifest || typeof pkg.code !== "string") {
			return {
				success: false,
				error: { code: "INVALID_PACKAGE", message: "Package must contain 'manifest' and 'code' fields" },
			};
		}

		const validationError = validateManifest(pkg.manifest, domain, action);
		if (validationError) {
			return {
				success: false,
				error: { code: "INVALID_MANIFEST", message: validationError },
			};
		}

		const commandDir = join(USER_COMMANDS_DIR, domain, action);
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
		} catch {
			// Directory does not exist yet, proceed.
		}

		await mkdir(commandDir, { recursive: true });

		const normalizedManifest = {
			...pkg.manifest,
			runtime: pkg.manifest.runtime || "node",
		};

		const entryFile = resolveEntryFile(normalizedManifest.runtime);

		await writeFile(join(commandDir, "manifest.json"), JSON.stringify(normalizedManifest, null, 2));
		await writeFile(join(commandDir, entryFile), pkg.code);
		if (typeof pkg.readme === "string") {
			await writeFile(join(commandDir, "README.md"), pkg.readme);
		}
		if (pkg.context !== undefined) {
			await writeFile(join(commandDir, "context.md"), formatContext(pkg.context));
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
