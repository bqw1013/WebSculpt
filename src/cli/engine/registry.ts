import { access, readdir, readFile } from "fs/promises";
import { join } from "path";
import { USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import { getBuiltinCommandsDir } from "./paths.js";

/** A command that has been resolved to an on-disk module and its origin. */
export interface ResolvedCommand {
	manifest: CommandManifest;
	/** Absolute path to the command entry file (e.g. command.js). */
	commandPath: string;
	source: "user" | "builtin";
	/** Execution runtime derived from the manifest. */
	runtime: string;
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

async function scanCommands(baseDir: string, source: "user" | "builtin"): Promise<ResolvedCommand[]> {
	const results: ResolvedCommand[] = [];
	try {
		const domainDirs = await readdir(baseDir, { withFileTypes: true });
		for (const domainDir of domainDirs) {
			if (!domainDir.isDirectory()) continue;
			const domainPath = join(baseDir, domainDir.name);
			const actionDirs = await readdir(domainPath, { withFileTypes: true });
			for (const actionDir of actionDirs) {
				if (!actionDir.isDirectory()) continue;
				const actionPath = join(domainPath, actionDir.name);
				const manifestPath = join(actionPath, "manifest.json");
				try {
					await access(manifestPath);
					const raw = await readFile(manifestPath, "utf-8");
					const manifest = JSON.parse(raw) as CommandManifest;
					const runtime = manifest.runtime || "node";
					const entryFile = resolveEntryFile(runtime);
					const commandPath = join(actionPath, entryFile);
					await access(commandPath);
					results.push({ manifest, commandPath, source, runtime });
				} catch {
					// Skip directories that are missing a manifest or command file.
				}
			}
		}
	} catch {
		// The base directory may not exist yet (e.g. no user commands).
	}
	return results;
}

/**
 * Finds a single command by domain and action.
 * User commands are scanned first so they can override built-ins.
 */
export async function findCommand(domain: string, action: string): Promise<ResolvedCommand | null> {
	const userCommands = await scanCommands(USER_COMMANDS_DIR, "user");
	const userHit = userCommands.find((c) => c.manifest.domain === domain && c.manifest.action === action);
	if (userHit) return userHit;

	const builtinDir = getBuiltinCommandsDir();
	const builtinCommands = await scanCommands(builtinDir, "builtin");
	const builtinHit = builtinCommands.find((c) => c.manifest.domain === domain && c.manifest.action === action);
	if (builtinHit) return builtinHit;

	return null;
}

/** Returns all available commands, with user commands ordered before built-ins. */
export async function listAllCommands(): Promise<ResolvedCommand[]> {
	const userCommands = await scanCommands(USER_COMMANDS_DIR, "user");
	const builtinDir = getBuiltinCommandsDir();
	const builtinCommands = await scanCommands(builtinDir, "builtin");
	return [...userCommands, ...builtinCommands];
}

/**
 * Attempts to find a command that matches a given host string.
 * Uses a naive substring heuristic.
 */
export async function findCommandByHost(host: string): Promise<ResolvedCommand | null> {
	const all = await listAllCommands();
	return (
		all.find((c) => {
			const h = host.toLowerCase();
			return (
				c.manifest.domain.toLowerCase().includes(h) ||
				c.manifest.id.toLowerCase().includes(h) ||
				c.manifest.description.toLowerCase().includes(h)
			);
		}) || null
	);
}
