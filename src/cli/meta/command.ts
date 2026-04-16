import { access, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import { listAllCommands } from "../engine/registry.js";
import { printJson } from "../output.js";

const RESERVED_DOMAINS = new Set(["command", "config"]);

/** Input shape expected from the --from-file payload. */
interface CommandPackage {
	manifest: CommandManifest;
	code: string;
	readme?: string;
	context?: string | Record<string, unknown>;
}

/** Lists all registered commands in a tabular format. */
export async function handleCommandList(): Promise<void> {
	const commands = await listAllCommands();
	if (commands.length === 0) {
		console.log("No commands available.");
		return;
	}

	const rows = commands.map((c) => ({
		domain: c.manifest.domain,
		action: c.manifest.action,
		type: c.source,
		id: c.manifest.id,
		description: c.manifest.description || "-",
		path: c.commandPath,
	}));

	// Compute column widths so the table aligns cleanly.
	const typeMax = Math.max(...rows.map((r) => r.type.length), 4);
	const domainMax = Math.max(...rows.map((r) => r.domain.length), 6);
	const actionMax = Math.max(...rows.map((r) => r.action.length), 6);
	const idMax = Math.max(...rows.map((r) => r.id.length), 2);

	const pad = (s: string, n: number) => s.padEnd(n, " ");

	console.log(
		`${pad("Type", typeMax)}  ${pad("Domain", domainMax)}  ${pad("Action", actionMax)}  ${pad("ID", idMax)}  Description`,
	);
	console.log("-".repeat(typeMax + domainMax + actionMax + idMax + 14));

	for (const r of rows) {
		console.log(
			`${pad(r.type, typeMax)}  ${pad(r.domain, domainMax)}  ${pad(r.action, actionMax)}  ${pad(r.id, idMax)}  ${r.description}`,
		);
	}
}

/** Displays details for a specific command. (Not implemented) */
export async function handleCommandShow(domain: string, action: string): Promise<void> {
	console.log(`Command: ${domain}/${action}`);
	console.log("Status: Not implemented yet");
}

/** Removes a user-defined command. (Not implemented) */
export async function handleCommandRemove(domain: string, action: string): Promise<void> {
	console.log(`Command "${domain}/${action}" removed successfully. (Not implemented yet)`);
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
): Promise<void> {
	try {
		if (RESERVED_DOMAINS.has(domain)) {
			printJson({
				success: false,
				error: {
					code: "RESERVED_DOMAIN",
					message: `Domain "${domain}" is reserved for meta commands`,
				},
			});
			return;
		}

		let raw: string;
		try {
			raw = await readFile(options.fromFile, "utf-8");
		} catch {
			printJson({
				success: false,
				error: { code: "FILE_NOT_FOUND", message: `Cannot read file: ${options.fromFile}` },
			});
			return;
		}

		let pkg: CommandPackage;
		try {
			pkg = JSON.parse(raw) as CommandPackage;
		} catch {
			printJson({
				success: false,
				error: { code: "PARSE_ERROR", message: `Invalid JSON in file: ${options.fromFile}` },
			});
			return;
		}

		if (!pkg.manifest || typeof pkg.code !== "string") {
			printJson({
				success: false,
				error: { code: "INVALID_PACKAGE", message: "Package must contain 'manifest' and 'code' fields" },
			});
			return;
		}

		const validationError = validateManifest(pkg.manifest, domain, action);
		if (validationError) {
			printJson({
				success: false,
				error: { code: "INVALID_MANIFEST", message: validationError },
			});
			return;
		}

		const commandDir = join(USER_COMMANDS_DIR, domain, action);
		try {
			await access(commandDir);
			if (!options.force) {
				printJson({
					success: false,
					error: {
						code: "ALREADY_EXISTS",
						message: `Command "${domain}/${action}" already exists. Use --force to overwrite.`,
					},
				});
				return;
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

		printJson({
			success: true,
			command: `${domain}/${action}`,
			path: commandDir,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		printJson({
			success: false,
			error: { code: "CREATE_ERROR", message },
		});
	}
}
