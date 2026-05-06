import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { USER_COMMANDS_DIR } from "../../../infra/paths.js";
import type { CommandManifest } from "../../../types/index.js";
import { normalizeRuntime, resolveEntryFile } from "../../runtime/index.js";
import { RESERVED_DOMAINS, type ResolvedCommand } from "../contract.js";
import { getBuiltinCommandsDir } from "../paths.js";

/** Scans a single directory tree for commands. */
export async function scanCommands(baseDir: string, source: "user" | "builtin"): Promise<ResolvedCommand[]> {
	const results: ResolvedCommand[] = [];
	try {
		const domainDirs = await readdir(baseDir, { withFileTypes: true });
		for (const domainDir of domainDirs) {
			if (!domainDir.isDirectory()) continue;
			if (RESERVED_DOMAINS.has(domainDir.name)) continue;
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
					const runtime = normalizeRuntime(manifest.runtime);
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

/** Scans both user and builtin directories and returns resolved commands. */
export async function scanAllCommands(): Promise<ResolvedCommand[]> {
	const userCommands = await scanCommands(USER_COMMANDS_DIR, "user");
	const builtinDir = getBuiltinCommandsDir();
	const builtinCommands = await scanCommands(builtinDir, "builtin");
	return [...userCommands, ...builtinCommands];
}
