import { existsSync } from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_PATH, USER_COMMANDS_DIR } from "../../infra/paths.js";
import type { CommandManifest } from "../../types/index.js";
import { getBuiltinCommandsDir } from "./paths.js";

/** Domains reserved for meta commands; user-defined commands in these domains are ignored. */
export const RESERVED_DOMAINS = new Set(["command", "config", "skill"]);

/** A command that has been resolved to an on-disk module and its origin. */
export interface ResolvedCommand {
	manifest: CommandManifest;
	/** Absolute path to the command entry file (e.g. command.js). */
	commandPath: string;
	source: "user" | "builtin";
	/** Execution runtime derived from the manifest. */
	runtime: string;
}

/** Shape of the persistent registry index file. */
export interface RegistryIndex {
	formatVersion: number;
	appVersion: string;
	generatedAt: string;
	commands: Array<{
		manifest: CommandManifest;
		source: "user" | "builtin";
		runtime: string;
	}>;
}

let cachedCommands: ResolvedCommand[] | null = null;

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

async function getAppVersion(): Promise<string> {
	const __filename = fileURLToPath(import.meta.url);
	const projectRoot = dirname(dirname(dirname(dirname(__filename))));
	const pkgRaw = await readFile(join(projectRoot, "package.json"), "utf-8");
	const pkg = JSON.parse(pkgRaw) as { version: string };
	return pkg.version;
}

async function scanCommands(baseDir: string, source: "user" | "builtin"): Promise<ResolvedCommand[]> {
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

/** Scans both user and builtin directories and returns resolved commands. */
export async function scanAllCommands(): Promise<ResolvedCommand[]> {
	const userCommands = await scanCommands(USER_COMMANDS_DIR, "user");
	const builtinDir = getBuiltinCommandsDir();
	const builtinCommands = await scanCommands(builtinDir, "builtin");
	return [...userCommands, ...builtinCommands];
}

/** Derives a ResolvedCommand from an index entry by computing commandPath at runtime. */
export function toResolvedCommand(entry: {
	manifest: CommandManifest;
	source: "user" | "builtin";
	runtime: string;
}): ResolvedCommand {
	const baseDir = entry.source === "user" ? USER_COMMANDS_DIR : getBuiltinCommandsDir();
	const actionPath = join(baseDir, entry.manifest.domain, entry.manifest.action);
	const entryFile = resolveEntryFile(entry.runtime);
	const commandPath = join(actionPath, entryFile);
	return {
		manifest: entry.manifest,
		commandPath,
		source: entry.source,
		runtime: entry.runtime,
	};
}

/** Reads and validates the index file, returning null on any error. */
export async function readIndex(): Promise<RegistryIndex | null> {
	try {
		const raw = await readFile(INDEX_PATH, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"formatVersion" in parsed &&
			"appVersion" in parsed &&
			"generatedAt" in parsed &&
			"commands" in parsed &&
			Array.isArray((parsed as RegistryIndex).commands)
		) {
			return parsed as RegistryIndex;
		}
		return null;
	} catch {
		return null;
	}
}

/** Scans all commands, serializes to RegistryIndex, and writes to INDEX_PATH. */
export async function rebuildIndex(): Promise<void> {
	const commands = await scanAllCommands();
	const appVersion = await getAppVersion();
	const index: RegistryIndex = {
		formatVersion: 1,
		appVersion,
		generatedAt: new Date().toISOString(),
		commands: commands.map((c) => ({
			manifest: c.manifest,
			source: c.source,
			runtime: c.runtime,
		})),
	};
	await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Loads the registry from the index (or rebuilds if missing/corrupted/stale)
 * and populates the in-memory cache.
 */
export async function loadRegistry(): Promise<void> {
	const appVersion = await getAppVersion();
	const index = await readIndex();
	if (index && index.appVersion === appVersion) {
		const builtinDir = getBuiltinCommandsDir();
		const builtinScanned = await scanCommands(builtinDir, "builtin");
		const builtinInIndex = index.commands.filter((c) => c.source === "builtin");
		const toKey = (c: { manifest: { domain: string; action: string } }) =>
			`${c.manifest.domain}/${c.manifest.action}`;
		const scannedKeys = new Set(builtinScanned.map(toKey));
		const indexKeys = new Set(builtinInIndex.map(toKey));
		const builtinChanged =
			scannedKeys.size !== indexKeys.size ||
			[...scannedKeys].some((k) => !indexKeys.has(k)) ||
			builtinScanned.some((s) => {
				const indexed = builtinInIndex.find(
					(i) => i.manifest.domain === s.manifest.domain && i.manifest.action === s.manifest.action,
				);
				return !indexed || indexed.manifest.requiresBrowser !== s.manifest.requiresBrowser;
			});
		if (!builtinChanged) {
			cachedCommands = index.commands.map(toResolvedCommand);
			return;
		}
		const commands = await scanAllCommands();
		cachedCommands = commands;
		await rebuildIndex();
	} else {
		const commands = await scanAllCommands();
		cachedCommands = commands;
		await rebuildIndex();
	}
}

/** Clears the in-memory registry cache. */
export function clearRegistryCache(): void {
	cachedCommands = null;
}

/** Returns all available commands from the in-memory cache. */
export function listAllCommands(): ResolvedCommand[] {
	if (!cachedCommands) {
		throw new Error("Registry not loaded. Call loadRegistry() first.");
	}
	const stale: ResolvedCommand[] = [];
	const valid = cachedCommands.filter((c) => {
		if (existsSync(c.commandPath)) return true;
		stale.push(c);
		return false;
	});
	if (stale.length > 0) {
		cachedCommands = valid;
		rebuildIndex().catch(() => {});
	}
	return [...valid];
}

/**
 * Finds a single command by domain and action from the in-memory cache.
 * User commands take precedence over built-ins.
 * Stale entries missing on disk are evicted lazily.
 */
export function findCommand(domain: string, action: string): ResolvedCommand | null {
	if (!cachedCommands) {
		throw new Error("Registry not loaded. Call loadRegistry() first.");
	}
	const candidates = [
		cachedCommands.find((c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "user"),
		cachedCommands.find(
			(c) => c.manifest.domain === domain && c.manifest.action === action && c.source === "builtin",
		),
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (existsSync(candidate.commandPath)) return candidate;
		cachedCommands = cachedCommands.filter((c) => c !== candidate);
		rebuildIndex().catch(() => {});
	}
	return null;
}
